import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'

interface RequestBody {
  projectId?: string
  agent?: string
  supabaseUrl?: string
  supabaseAnonKey?: string
  openaiApiKey?: string
  openaiModel?: string
  forceRefresh?: boolean
}

interface ParsedRequest {
  projectId: string
  agent: string
  supabaseUrl: string
  supabaseAnonKey: string
  openaiApiKey: string
  openaiModel: string
  forceRefresh: boolean
}

interface WorkingMemoryData {
  summary?: string
  goals?: string[]
  requirements?: string[]
  constraints?: string[]
  decisions?: string[]
  assumptions?: string[]
  openQuestions?: string[]
  glossary?: Record<string, string>
  stakeholders?: string[]
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return {}
  return JSON.parse(raw) as unknown
}

function json(res: ServerResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

function parseStringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() || undefined : undefined
}

function parseRequestBody(body: RequestBody): Partial<ParsedRequest> {
  const projectId = parseStringValue(body.projectId)
  const agent = parseStringValue(body.agent)
  const supabaseUrl =
    parseStringValue(body.supabaseUrl) ||
    process.env.SUPABASE_URL?.trim() ||
    process.env.VITE_SUPABASE_URL?.trim() ||
    undefined
  const supabaseAnonKey =
    parseStringValue(body.supabaseAnonKey) ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.VITE_SUPABASE_ANON_KEY?.trim() ||
    undefined
  const openaiApiKey = parseStringValue(body.openaiApiKey)
  const openaiModel = parseStringValue(body.openaiModel)
  const forceRefresh = typeof body.forceRefresh === 'boolean' ? body.forceRefresh : false

  return {
    projectId,
    agent,
    supabaseUrl,
    supabaseAnonKey,
    openaiApiKey,
    openaiModel,
    forceRefresh,
  }
}

function validateRequest(parsed: Partial<ParsedRequest>, res: ServerResponse): parsed is ParsedRequest {
  if (!parsed.projectId || !parsed.agent) {
    json(res, 400, {
      success: false,
      error: 'projectId and agent are required.',
    })
    return false
  }

  if (!parsed.supabaseUrl || !parsed.supabaseAnonKey) {
    json(res, 400, {
      success: false,
      error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
    })
    return false
  }

  if (!parsed.openaiApiKey || !parsed.openaiModel) {
    json(res, 400, {
      success: false,
      error: 'OpenAI credentials required (provide openaiApiKey and openaiModel in request body).',
    })
    return false
  }

  return true
}

function formatConversationText(messages: Array<{ role: string; content: string }>): string {
  return messages.map((m) => `**${m.role}**: ${m.content}`).join('\n\n')
}

function createWorkingMemoryPrompt(conversationText: string): string {
  return `You are analyzing a conversation between a user and a Project Manager agent. Extract and structure key information into a working memory format.

Conversation:
${conversationText}

Extract the following structured information:
1. **Summary**: A concise 2-3 sentence summary of the conversation context
2. **Goals**: Array of project goals discussed (one per line, be specific)
3. **Requirements**: Array of requirements identified (one per line, be specific)
4. **Constraints**: Array of constraints or limitations mentioned (one per line, be specific)
5. **Decisions**: Array of decisions made during the conversation (one per line, be specific)
6. **Assumptions**: Array of assumptions stated or implied (one per line, be specific)
7. **Open Questions**: Array of open questions that need answers (one per line, be specific)
8. **Glossary**: JSON object mapping terms to definitions (format: {"term": "definition", ...})
9. **Stakeholders**: Array of stakeholders mentioned (one per line, be specific)

Return ONLY a valid JSON object with this exact structure:
{
  "summary": "concise summary here",
  "goals": ["goal1", "goal2"],
  "requirements": ["req1", "req2"],
  "constraints": ["constraint1", "constraint2"],
  "decisions": ["decision1", "decision2"],
  "assumptions": ["assumption1", "assumption2"],
  "openQuestions": ["question1", "question2"],
  "glossary": {"term1": "definition1", "term2": "definition2"},
  "stakeholders": ["stakeholder1", "stakeholder2"]
}

Return ONLY the JSON object, no other text.`
}

function extractJsonFromResponse(content: string): string {
  const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/s)
  return jsonMatch ? jsonMatch[1] : content
}

async function callOpenAI(
  apiKey: string,
  model: string,
  prompt: string
): Promise<WorkingMemoryData> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 2000,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenAI API error: ${response.status} ${errorText}`)
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = data.choices?.[0]?.message?.content?.trim()

  if (!content) {
    throw new Error('OpenAI returned empty response')
  }

  const jsonStr = extractJsonFromResponse(content)
  return JSON.parse(jsonStr) as WorkingMemoryData
}

function buildWorkingMemoryResponse(workingMemory: WorkingMemoryData, throughSequence: number) {
  return {
    summary: workingMemory.summary || '',
    goals: workingMemory.goals || [],
    requirements: workingMemory.requirements || [],
    constraints: workingMemory.constraints || [],
    decisions: workingMemory.decisions || [],
    assumptions: workingMemory.assumptions || [],
    openQuestions: workingMemory.openQuestions || [],
    glossary: workingMemory.glossary || {},
    stakeholders: workingMemory.stakeholders || [],
    lastUpdatedAt: new Date().toISOString(),
    throughSequence,
  }
}

function buildExistingMemoryResponse(existing: any) {
  return {
    summary: existing.summary || '',
    goals: existing.goals || [],
    requirements: existing.requirements || [],
    constraints: existing.constraints || [],
    decisions: existing.decisions || [],
    assumptions: existing.assumptions || [],
    openQuestions: existing.open_questions || [],
    glossary: existing.glossary || {},
    stakeholders: existing.stakeholders || [],
    lastUpdatedAt: existing.last_updated_at || null,
    throughSequence: existing.through_sequence || 0,
  }
}

async function handleCorsAndMethod(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return false
  }

  if (req.method !== 'POST') {
    res.statusCode = 405
    res.end('Method Not Allowed')
    return false
  }

  return true
}

async function fetchMessages(
  supabase: any,
  projectId: string,
  agent: string
): Promise<Array<{ role: string; content: string; sequence: number }>> {
  const { data: messages, error: messagesError } = await supabase
    .from('hal_conversation_messages')
    .select('role, content, sequence')
    .eq('project_id', projectId)
    .eq('agent', agent)
    .order('sequence', { ascending: true })

  if (messagesError) {
    throw new Error(`Failed to fetch conversation messages: ${messagesError.message}`)
  }

  if (!messages || messages.length === 0) {
    throw new Error('No conversation messages found.')
  }

  return messages
}

async function shouldUpdateMemory(
  supabase: any,
  projectId: string,
  agent: string,
  currentSequence: number,
  forceRefresh: boolean
): Promise<boolean> {
  if (forceRefresh) {
    return true
  }

  const { data: existingMemory } = await supabase
    .from('hal_conversation_working_memory')
    .select('through_sequence')
    .eq('project_id', projectId)
    .eq('agent', agent)
    .maybeSingle()

  const lastProcessedSequence = existingMemory?.through_sequence ?? 0
  return currentSequence > lastProcessedSequence
}

async function getExistingMemory(
  supabase: any,
  projectId: string,
  agent: string
): Promise<any | null> {
  const { data: existing } = await supabase
    .from('hal_conversation_working_memory')
    .select('*')
    .eq('project_id', projectId)
    .eq('agent', agent)
    .maybeSingle()

  return existing
}

async function saveWorkingMemory(
  supabase: any,
  projectId: string,
  agent: string,
  workingMemory: WorkingMemoryData,
  throughSequence: number
): Promise<void> {
  const { error: upsertError } = await supabase
    .from('hal_conversation_working_memory')
    .upsert(
      {
        project_id: projectId,
        agent,
        summary: workingMemory.summary || '',
        goals: workingMemory.goals || [],
        requirements: workingMemory.requirements || [],
        constraints: workingMemory.constraints || [],
        decisions: workingMemory.decisions || [],
        assumptions: workingMemory.assumptions || [],
        open_questions: workingMemory.openQuestions || [],
        glossary: workingMemory.glossary || {},
        stakeholders: workingMemory.stakeholders || [],
        through_sequence: throughSequence,
        last_updated_at: new Date().toISOString(),
      },
      { onConflict: 'project_id,agent' }
    )

  if (upsertError) {
    throw new Error(`Failed to save working memory: ${upsertError.message}`)
  }
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (!(await handleCorsAndMethod(req, res))) {
    return
  }

  try {
    const body = (await readJsonBody(req)) as RequestBody
    const parsed = parseRequestBody(body)

    if (!validateRequest(parsed, res)) {
      return
    }

    const supabase = createClient(parsed.supabaseUrl, parsed.supabaseAnonKey)

    const messages = await fetchMessages(supabase, parsed.projectId, parsed.agent)
    const currentSequence = messages[messages.length - 1]?.sequence ?? 0
    const needsUpdate = await shouldUpdateMemory(
      supabase,
      parsed.projectId,
      parsed.agent,
      currentSequence,
      parsed.forceRefresh
    )

    if (!needsUpdate) {
      const existing = await getExistingMemory(supabase, parsed.projectId, parsed.agent)
      if (existing) {
        json(res, 200, {
          success: true,
          workingMemory: buildExistingMemoryResponse(existing),
          updated: false,
        })
        return
      }
    }

    const conversationText = formatConversationText(messages)
    const prompt = createWorkingMemoryPrompt(conversationText)

    try {
      const workingMemory = await callOpenAI(parsed.openaiApiKey, parsed.openaiModel, prompt)
      await saveWorkingMemory(supabase, parsed.projectId, parsed.agent, workingMemory, currentSequence)

      json(res, 200, {
        success: true,
        workingMemory: buildWorkingMemoryResponse(workingMemory, currentSequence),
        updated: true,
      })
    } catch (openaiErr) {
      json(res, 200, {
        success: false,
        error: `Failed to parse working memory from OpenAI response: ${openaiErr instanceof Error ? openaiErr.message : String(openaiErr)}`,
      })
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    if (errorMessage.includes('Failed to fetch conversation messages') || errorMessage.includes('No conversation messages found')) {
      json(res, 200, {
        success: false,
        error: errorMessage,
      })
    } else {
      json(res, 500, {
        success: false,
        error: errorMessage,
      })
    }
  }
}