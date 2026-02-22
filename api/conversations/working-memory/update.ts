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

interface WorkingMemoryFromDB {
  summary?: string | null
  goals?: string[] | null
  requirements?: string[] | null
  constraints?: string[] | null
  decisions?: string[] | null
  assumptions?: string[] | null
  open_questions?: string[] | null
  glossary?: Record<string, string> | null
  stakeholders?: string[] | null
  last_updated_at?: string | null
  through_sequence?: number | null
}

interface WorkingMemoryAPI {
  summary: string
  goals: string[]
  requirements: string[]
  constraints: string[]
  decisions: string[]
  assumptions: string[]
  openQuestions: string[]
  glossary: Record<string, string>
  stakeholders: string[]
  lastUpdatedAt: string | null
  throughSequence: number
}

interface ParsedCredentials {
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

function setCorsHeaders(res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

function parseStringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() || undefined : undefined
}

function parseCredentials(body: RequestBody): ParsedCredentials | null {
  const projectId = parseStringValue(body.projectId)
  const agent = parseStringValue(body.agent)
  const supabaseUrl =
    parseStringValue(body.supabaseUrl) ||
    parseStringValue(process.env.SUPABASE_URL) ||
    parseStringValue(process.env.VITE_SUPABASE_URL) ||
    undefined
  const supabaseAnonKey =
    parseStringValue(body.supabaseAnonKey) ||
    parseStringValue(process.env.SUPABASE_ANON_KEY) ||
    parseStringValue(process.env.VITE_SUPABASE_ANON_KEY) ||
    undefined
  const openaiApiKey = parseStringValue(body.openaiApiKey)
  const openaiModel = parseStringValue(body.openaiModel)
  const forceRefresh = typeof body.forceRefresh === 'boolean' ? body.forceRefresh : false

  if (!projectId || !agent) {
    return null
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    return null
  }

  if (!openaiApiKey || !openaiModel) {
    return null
  }

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

function transformWorkingMemoryFromDB(db: WorkingMemoryFromDB): WorkingMemoryAPI {
  return {
    summary: db.summary || '',
    goals: db.goals || [],
    requirements: db.requirements || [],
    constraints: db.constraints || [],
    decisions: db.decisions || [],
    assumptions: db.assumptions || [],
    openQuestions: db.open_questions || [],
    glossary: db.glossary || {},
    stakeholders: db.stakeholders || [],
    lastUpdatedAt: db.last_updated_at || null,
    throughSequence: db.through_sequence || 0,
  }
}

function transformWorkingMemoryToDB(
  api: Partial<WorkingMemoryAPI>,
  projectId: string,
  agent: string,
  currentSequence: number
) {
  return {
    project_id: projectId,
    agent,
    summary: api.summary || '',
    goals: api.goals || [],
    requirements: api.requirements || [],
    constraints: api.constraints || [],
    decisions: api.decisions || [],
    assumptions: api.assumptions || [],
    open_questions: api.openQuestions || [],
    glossary: api.glossary || {},
    stakeholders: api.stakeholders || [],
    through_sequence: currentSequence,
    last_updated_at: new Date().toISOString(),
  }
}

async function fetchMessages(
  supabase: any,
  projectId: string,
  agent: string
) {
  const { data: messages, error: messagesError } = await supabase
    .from('hal_conversation_messages')
    .select('role, content, sequence')
    .eq('project_id', projectId)
    .eq('agent', agent)
    .order('sequence', { ascending: true })

  if (messagesError) {
    return { messages: null, error: messagesError }
  }

  if (!messages || messages.length === 0) {
    return { messages: null, error: { message: 'No conversation messages found.' } }
  }

  return { messages, error: null }
}

async function getExistingMemorySequence(
  supabase: any,
  projectId: string,
  agent: string
) {
  const { data: existingMemory } = await supabase
    .from('hal_conversation_working_memory')
    .select('through_sequence')
    .eq('project_id', projectId)
    .eq('agent', agent)
    .maybeSingle()

  return existingMemory?.through_sequence ?? 0
}

async function getExistingWorkingMemory(
  supabase: any,
  projectId: string,
  agent: string
) {
  const { data: existing } = await supabase
    .from('hal_conversation_working_memory')
    .select('*')
    .eq('project_id', projectId)
    .eq('agent', agent)
    .maybeSingle()

  return existing
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

async function callOpenAI(
  apiKey: string,
  model: string,
  prompt: string
): Promise<{ content: string } | { error: string }> {
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

  return { content }
}

function parseWorkingMemoryFromOpenAI(content: string): Partial<WorkingMemoryAPI> {
  let jsonStr = content
  const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/s)
  if (jsonMatch) {
    jsonStr = jsonMatch[1]
  }

  return JSON.parse(jsonStr) as Partial<WorkingMemoryAPI>
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  setCorsHeaders(res)

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
    const credentials = parseCredentials(body)

    if (!credentials) {
      const projectId = parseStringValue(body.projectId)
      const agent = parseStringValue(body.agent)
      
      if (!projectId || !agent) {
        json(res, 400, {
          success: false,
          error: 'projectId and agent are required.',
        })
        return
      }
      if (!parseStringValue(body.supabaseUrl) && !parseStringValue(process.env.SUPABASE_URL) && !parseStringValue(process.env.VITE_SUPABASE_URL)) {
        json(res, 400, {
          success: false,
          error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
        })
        return
      }
      json(res, 400, {
        success: false,
        error: 'OpenAI credentials required (provide openaiApiKey and openaiModel in request body).',
      })
      return
    }

    const { projectId, agent, supabaseUrl, supabaseAnonKey, openaiApiKey, openaiModel, forceRefresh } = credentials
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    const { messages, error: messagesError } = await fetchMessages(supabase, projectId, agent)

    if (messagesError) {
      json(res, 200, {
        success: false,
        error: `Failed to fetch conversation messages: ${messagesError.message}`,
      })
      return
    }

    if (!messages) {
      json(res, 200, {
        success: false,
        error: 'No conversation messages found.',
      })
      return
    }

    const currentSequence = messages[messages.length - 1]?.sequence ?? 0
    const lastProcessedSequence = await getExistingMemorySequence(supabase, projectId, agent)

    if (!forceRefresh && currentSequence <= lastProcessedSequence) {
      const existing = await getExistingWorkingMemory(supabase, projectId, agent)
      if (existing) {
        json(res, 200, {
          success: true,
          workingMemory: transformWorkingMemoryFromDB(existing),
          updated: false,
        })
        return
      }
    }

    const conversationText = formatConversationText(messages)
    const prompt = createWorkingMemoryPrompt(conversationText)

    try {
      const openaiResult = await callOpenAI(openaiApiKey, openaiModel, prompt)

      if ('error' in openaiResult) {
        json(res, 200, {
          success: false,
          error: openaiResult.error,
        })
        return
      }

      const workingMemory = parseWorkingMemoryFromOpenAI(openaiResult.content)
      const dbRecord = transformWorkingMemoryToDB(workingMemory, projectId, agent, currentSequence)

      const { error: upsertError } = await supabase
        .from('hal_conversation_working_memory')
        .upsert(dbRecord, { onConflict: 'project_id,agent' })

      if (upsertError) {
        json(res, 200, {
          success: false,
          error: `Failed to save working memory: ${upsertError.message}`,
        })
        return
      }

      const apiResponse: WorkingMemoryAPI = {
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

      json(res, 200, {
        success: true,
        workingMemory: apiResponse,
        updated: true,
      })
    } catch (parseErr) {
      json(res, 200, {
        success: false,
        error: `Failed to parse working memory from OpenAI response: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
      })
      return
    }
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}