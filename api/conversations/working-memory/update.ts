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

interface WorkingMemory {
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

interface ParsedRequest {
  projectId: string
  agent: string
  supabaseUrl: string
  supabaseAnonKey: string
  openaiApiKey: string
  openaiModel: string
  forceRefresh: boolean
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

function handleCors(res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

function handleOptions(res: ServerResponse) {
  res.statusCode = 204
  res.end()
}

function parseRequestBody(body: unknown): RequestBody {
  return (body || {}) as RequestBody
}

function extractStringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() || undefined : undefined
}

function getSupabaseUrl(body: RequestBody): string | undefined {
  return (
    extractStringValue(body.supabaseUrl) ||
    process.env.SUPABASE_URL?.trim() ||
    process.env.VITE_SUPABASE_URL?.trim() ||
    undefined
  )
}

function getSupabaseAnonKey(body: RequestBody): string | undefined {
  return (
    extractStringValue(body.supabaseAnonKey) ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.VITE_SUPABASE_ANON_KEY?.trim() ||
    undefined
  )
}

function validateAndParseRequest(body: RequestBody): { valid: true; data: ParsedRequest } | { valid: false; error: string } {
  const projectId = extractStringValue(body.projectId)
  const agent = extractStringValue(body.agent)
  const supabaseUrl = getSupabaseUrl(body)
  const supabaseAnonKey = getSupabaseAnonKey(body)
  const openaiApiKey = extractStringValue(body.openaiApiKey)
  const openaiModel = extractStringValue(body.openaiModel)
  const forceRefresh = typeof body.forceRefresh === 'boolean' ? body.forceRefresh : false

  if (!projectId || !agent) {
    return { valid: false, error: 'projectId and agent are required.' }
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      valid: false,
      error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
    }
  }

  if (!openaiApiKey || !openaiModel) {
    return {
      valid: false,
      error: 'OpenAI credentials required (provide openaiApiKey and openaiModel in request body).',
    }
  }

  return {
    valid: true,
    data: {
      projectId,
      agent,
      supabaseUrl,
      supabaseAnonKey,
      openaiApiKey,
      openaiModel,
      forceRefresh,
    },
  }
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
  const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/)
  return jsonMatch ? jsonMatch[1] : content
}

function parseWorkingMemoryFromResponse(content: string): WorkingMemory {
  const jsonStr = extractJsonFromResponse(content)
  return JSON.parse(jsonStr) as WorkingMemory
}

function transformDbRowToResponse(dbRow: any) {
  return {
    summary: dbRow.summary || '',
    goals: dbRow.goals || [],
    requirements: dbRow.requirements || [],
    constraints: dbRow.constraints || [],
    decisions: dbRow.decisions || [],
    assumptions: dbRow.assumptions || [],
    openQuestions: dbRow.open_questions || [],
    glossary: dbRow.glossary || {},
    stakeholders: dbRow.stakeholders || [],
    lastUpdatedAt: dbRow.last_updated_at || null,
    throughSequence: dbRow.through_sequence || 0,
  }
}

function transformWorkingMemoryToDb(
  workingMemory: WorkingMemory,
  projectId: string,
  agent: string,
  currentSequence: number
) {
  return {
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
    through_sequence: currentSequence,
    last_updated_at: new Date().toISOString(),
  }
}

function transformWorkingMemoryToResponse(workingMemory: WorkingMemory, currentSequence: number) {
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
    throughSequence: currentSequence,
  }
}

function getCurrentSequence(messages: Array<{ sequence?: number }>): number {
  return messages[messages.length - 1]?.sequence ?? 0
}

function shouldUpdate(forceRefresh: boolean, currentSequence: number, lastProcessedSequence: number): boolean {
  return forceRefresh || currentSequence > lastProcessedSequence
}

async function fetchMessages(supabase: any, projectId: string, agent: string) {
  const { data: messages, error: messagesError } = await supabase
    .from('hal_conversation_messages')
    .select('role, content, sequence')
    .eq('project_id', projectId)
    .eq('agent', agent)
    .order('sequence', { ascending: true })

  if (messagesError) {
    return { success: false as const, error: `Failed to fetch conversation messages: ${messagesError.message}` }
  }

  if (!messages || messages.length === 0) {
    return { success: false as const, error: 'No conversation messages found.' }
  }

  return { success: true as const, messages }
}

async function getExistingMemorySequence(supabase: any, projectId: string, agent: string) {
  const { data: existingMemory } = await supabase
    .from('hal_conversation_working_memory')
    .select('through_sequence')
    .eq('project_id', projectId)
    .eq('agent', agent)
    .maybeSingle()

  return existingMemory?.through_sequence ?? 0
}

async function getExistingMemory(supabase: any, projectId: string, agent: string) {
  const { data: existing } = await supabase
    .from('hal_conversation_working_memory')
    .select('*')
    .eq('project_id', projectId)
    .eq('agent', agent)
    .maybeSingle()

  return existing
}

async function callOpenAI(openaiApiKey: string, openaiModel: string, prompt: string) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: openaiModel,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 2000,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    return { success: false as const, error: `OpenAI API error: ${response.status} ${errorText}` }
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = data.choices?.[0]?.message?.content?.trim()

  if (!content) {
    return { success: false as const, error: 'OpenAI returned empty response' }
  }

  return { success: true as const, content }
}

async function saveWorkingMemory(
  supabase: any,
  workingMemory: WorkingMemory,
  projectId: string,
  agent: string,
  currentSequence: number
) {
  const dbData = transformWorkingMemoryToDb(workingMemory, projectId, agent, currentSequence)
  const { error: upsertError } = await supabase
    .from('hal_conversation_working_memory')
    .upsert(dbData, { onConflict: 'project_id,agent' })

  if (upsertError) {
    return { success: false as const, error: `Failed to save working memory: ${upsertError.message}` }
  }

  return { success: true as const }
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  handleCors(res)

  if (req.method === 'OPTIONS') {
    handleOptions(res)
    return
  }

  if (req.method !== 'POST') {
    res.statusCode = 405
    res.end('Method Not Allowed')
    return
  }

  try {
    const body = parseRequestBody(await readJsonBody(req))
    const validation = validateAndParseRequest(body)

    if (validation.valid === false) {
      json(res, 400, { success: false, error: validation.error })
      return
    }

    const { projectId, agent, supabaseUrl, supabaseAnonKey, openaiApiKey, openaiModel, forceRefresh } = validation.data
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    const messagesResult = await fetchMessages(supabase, projectId, agent)
    if (!messagesResult.success) {
      json(res, 200, { success: false, error: messagesResult.error })
      return
    }

    const messages = messagesResult.messages
    const currentSequence = getCurrentSequence(messages)
    const lastProcessedSequence = await getExistingMemorySequence(supabase, projectId, agent)

    if (!shouldUpdate(forceRefresh, currentSequence, lastProcessedSequence)) {
      const existing = await getExistingMemory(supabase, projectId, agent)
      if (existing) {
        json(res, 200, {
          success: true,
          workingMemory: transformDbRowToResponse(existing),
          updated: false,
        })
        return
      }
    }

    const conversationText = formatConversationText(messages)
    const prompt = createWorkingMemoryPrompt(conversationText)

    try {
      const openaiResult = await callOpenAI(openaiApiKey, openaiModel, prompt)
      if (!openaiResult.success) {
        json(res, 200, { success: false, error: openaiResult.error })
        return
      }

      const workingMemory = parseWorkingMemoryFromResponse(openaiResult.content)

      const saveResult = await saveWorkingMemory(supabase, workingMemory, projectId, agent, currentSequence)
      if (!saveResult.success) {
        json(res, 200, { success: false, error: saveResult.error })
        return
      }

      json(res, 200, {
        success: true,
        workingMemory: transformWorkingMemoryToResponse(workingMemory, currentSequence),
        updated: true,
      })
    } catch (parseErr) {
      json(res, 200, {
        success: false,
        error: `Failed to parse working memory from OpenAI response: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
      })
    }
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}