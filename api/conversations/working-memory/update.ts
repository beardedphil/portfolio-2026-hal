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

interface ParsedInput {
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

export function trimString(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() || undefined : undefined
}

function parseInput(body: RequestBody): ParsedInput | { error: string } {
  const projectId = trimString(body.projectId)
  const agent = trimString(body.agent)
  if (!projectId || !agent) {
    return { error: 'projectId and agent are required.' }
  }

  const supabaseUrl =
    trimString(body.supabaseUrl) ||
    process.env.SUPABASE_URL?.trim() ||
    process.env.VITE_SUPABASE_URL?.trim() ||
    undefined
  const supabaseAnonKey =
    trimString(body.supabaseAnonKey) ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.VITE_SUPABASE_ANON_KEY?.trim() ||
    undefined
  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
    }
  }

  const openaiApiKey = trimString(body.openaiApiKey)
  const openaiModel = trimString(body.openaiModel)
  if (!openaiApiKey || !openaiModel) {
    return { error: 'OpenAI credentials required (provide openaiApiKey and openaiModel in request body).' }
  }

  return {
    projectId,
    agent,
    supabaseUrl,
    supabaseAnonKey,
    openaiApiKey,
    openaiModel,
    forceRefresh: typeof body.forceRefresh === 'boolean' ? body.forceRefresh : false,
  }
}

export function formatConversationText(messages: Array<{ role: string; content: string }>): string {
  return messages.map((m) => `**${m.role}**: ${m.content}`).join('\n\n')
}

function createPrompt(conversationText: string): string {
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

export function extractJsonFromResponse(content: string): string {
  const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/)
  return jsonMatch ? jsonMatch[1] : content
}

async function callOpenAI(apiKey: string, model: string, prompt: string): Promise<WorkingMemory | { error: string }> {
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
    return { error: `OpenAI API error: ${response.status} ${errorText}` }
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = data.choices?.[0]?.message?.content?.trim()

  if (!content) {
    return { error: 'OpenAI returned empty response' }
  }

  try {
    const jsonStr = extractJsonFromResponse(content)
    return JSON.parse(jsonStr) as WorkingMemory
  } catch (parseErr) {
    return {
      error: `Failed to parse working memory from OpenAI response: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
    }
  }
}

export function transformWorkingMemory(memory: WorkingMemory) {
  return {
    summary: memory.summary || '',
    goals: memory.goals || [],
    requirements: memory.requirements || [],
    constraints: memory.constraints || [],
    decisions: memory.decisions || [],
    assumptions: memory.assumptions || [],
    openQuestions: memory.openQuestions || [],
    glossary: memory.glossary || {},
    stakeholders: memory.stakeholders || [],
  }
}

function transformExistingMemory(existing: any) {
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

export function getCurrentSequence(messages: Array<{ sequence?: number }>): number {
  return messages[messages.length - 1]?.sequence ?? 0
}

export function getLastProcessedSequence(existingMemory: { through_sequence?: number } | null): number {
  return existingMemory?.through_sequence ?? 0
}

export function shouldUpdateMemory(forceRefresh: boolean, currentSequence: number, lastProcessedSequence: number): boolean {
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
    return { error: `Failed to fetch conversation messages: ${messagesError.message}` }
  }

  if (!messages || messages.length === 0) {
    return { error: 'No conversation messages found.' }
  }

  return { messages }
}

async function getExistingMemorySequence(supabase: any, projectId: string, agent: string) {
  const { data: existingMemory } = await supabase
    .from('hal_conversation_working_memory')
    .select('through_sequence')
    .eq('project_id', projectId)
    .eq('agent', agent)
    .maybeSingle()

  return existingMemory
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

async function upsertWorkingMemory(
  supabase: any,
  projectId: string,
  agent: string,
  transformed: ReturnType<typeof transformWorkingMemory>,
  currentSequence: number
) {
  return await supabase.from('hal_conversation_working_memory').upsert(
    {
      project_id: projectId,
      agent,
      summary: transformed.summary,
      goals: transformed.goals,
      requirements: transformed.requirements,
      constraints: transformed.constraints,
      decisions: transformed.decisions,
      assumptions: transformed.assumptions,
      open_questions: transformed.openQuestions,
      glossary: transformed.glossary,
      stakeholders: transformed.stakeholders,
      through_sequence: currentSequence,
      last_updated_at: new Date().toISOString(),
    },
    { onConflict: 'project_id,agent' }
  )
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // CORS: Allow cross-origin requests
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  if (req.method !== 'POST') {
    res.statusCode = 405
    res.end('Method Not Allowed')
    return
  }

  try {
    const body = (await readJsonBody(req)) as RequestBody
    const input = parseInput(body)

    if ('error' in input) {
      json(res, 400, { success: false, error: input.error })
      return
    }

    const supabase = createClient(input.supabaseUrl, input.supabaseAnonKey)

    // Fetch conversation messages
    const messagesResult = await fetchMessages(supabase, input.projectId, input.agent)
    if ('error' in messagesResult) {
      json(res, 200, { success: false, error: messagesResult.error })
      return
    }
    const { messages } = messagesResult

    // Check if we need to update
    const existingMemory = await getExistingMemorySequence(supabase, input.projectId, input.agent)
    const currentSequence = getCurrentSequence(messages)
    const lastProcessedSequence = getLastProcessedSequence(existingMemory)
    const needsUpdate = shouldUpdateMemory(input.forceRefresh, currentSequence, lastProcessedSequence)

    if (!needsUpdate) {
      // Return existing memory
      const existing = await getExistingMemory(supabase, input.projectId, input.agent)
      if (existing) {
        json(res, 200, {
          success: true,
          workingMemory: transformExistingMemory(existing),
          updated: false,
        })
        return
      }
    }

    // Generate working memory using OpenAI
    const conversationText = formatConversationText(messages)
    const prompt = createPrompt(conversationText)
    const result = await callOpenAI(input.openaiApiKey, input.openaiModel, prompt)

    if ('error' in result) {
      json(res, 200, { success: false, error: result.error })
      return
    }

    const transformed = transformWorkingMemory(result)

    // Upsert working memory
    const { error: upsertError } = await upsertWorkingMemory(
      supabase,
      input.projectId,
      input.agent,
      transformed,
      currentSequence
    )

    if (upsertError) {
      json(res, 200, {
        success: false,
        error: `Failed to save working memory: ${upsertError.message}`,
      })
      return
    }

    json(res, 200, {
      success: true,
      workingMemory: {
        ...transformed,
        lastUpdatedAt: new Date().toISOString(),
        throughSequence: currentSequence,
      },
      updated: true,
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}