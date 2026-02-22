import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'

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

interface RequestBody {
  projectId?: string
  agent?: string
  supabaseUrl?: string
  supabaseAnonKey?: string
  openaiApiKey?: string
  openaiModel?: string
  forceRefresh?: boolean
}

interface WorkingMemoryApi {
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

interface WorkingMemoryDb {
  project_id: string
  agent: string
  summary: string
  goals: string[]
  requirements: string[]
  constraints: string[]
  decisions: string[]
  assumptions: string[]
  open_questions: string[]
  glossary: Record<string, string>
  stakeholders: string[]
  through_sequence: number
  last_updated_at: string
}

function parseRequestBody(body: unknown): RequestBody {
  const parsed = body as RequestBody
  return {
    projectId: typeof parsed.projectId === 'string' ? parsed.projectId.trim() || undefined : undefined,
    agent: typeof parsed.agent === 'string' ? parsed.agent.trim() || undefined : undefined,
    supabaseUrl: typeof parsed.supabaseUrl === 'string' ? parsed.supabaseUrl.trim() : undefined,
    supabaseAnonKey: typeof parsed.supabaseAnonKey === 'string' ? parsed.supabaseAnonKey.trim() : undefined,
    openaiApiKey: typeof parsed.openaiApiKey === 'string' ? parsed.openaiApiKey.trim() : undefined,
    openaiModel: typeof parsed.openaiModel === 'string' ? parsed.openaiModel.trim() : undefined,
    forceRefresh: typeof parsed.forceRefresh === 'boolean' ? parsed.forceRefresh : false,
  }
}

function getSupabaseUrl(body: RequestBody): string | undefined {
  return (
    body.supabaseUrl ||
    process.env.SUPABASE_URL?.trim() ||
    process.env.VITE_SUPABASE_URL?.trim() ||
    undefined
  )
}

function getSupabaseAnonKey(body: RequestBody): string | undefined {
  return (
    body.supabaseAnonKey ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.VITE_SUPABASE_ANON_KEY?.trim() ||
    undefined
  )
}

function validateRequest(body: RequestBody): { valid: boolean; error?: string } {
  if (!body.projectId || !body.agent) {
    return { valid: false, error: 'projectId and agent are required.' }
  }

  const supabaseUrl = getSupabaseUrl(body)
  const supabaseAnonKey = getSupabaseAnonKey(body)
  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      valid: false,
      error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
    }
  }

  if (!body.openaiApiKey || !body.openaiModel) {
    return {
      valid: false,
      error: 'OpenAI credentials required (provide openaiApiKey and openaiModel in request body).',
    }
  }

  return { valid: true }
}

function toApiFormat(db: any): WorkingMemoryApi {
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

function toDbFormat(
  wm: Partial<WorkingMemoryApi>,
  projectId: string,
  agent: string,
  currentSequence: number
): WorkingMemoryDb {
  return {
    project_id: projectId,
    agent,
    summary: wm.summary || '',
    goals: wm.goals || [],
    requirements: wm.requirements || [],
    constraints: wm.constraints || [],
    decisions: wm.decisions || [],
    assumptions: wm.assumptions || [],
    open_questions: wm.openQuestions || [],
    glossary: wm.glossary || {},
    stakeholders: wm.stakeholders || [],
    through_sequence: currentSequence,
    last_updated_at: new Date().toISOString(),
  }
}

function getCurrentSequence(messages: Array<{ sequence?: number }>): number {
  return messages[messages.length - 1]?.sequence ?? 0
}

function shouldUpdate(forceRefresh: boolean, currentSequence: number, lastProcessedSequence: number): boolean {
  return forceRefresh || currentSequence > lastProcessedSequence
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

function parseOpenAIResponse(content: string): Partial<WorkingMemoryApi> {
  let jsonStr = content.trim()
  const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/s)
  if (jsonMatch) {
    jsonStr = jsonMatch[1]
  }

  const parsed = JSON.parse(jsonStr) as Partial<WorkingMemoryApi>
  return {
    summary: parsed.summary,
    goals: parsed.goals,
    requirements: parsed.requirements,
    constraints: parsed.constraints,
    decisions: parsed.decisions,
    assumptions: parsed.assumptions,
    openQuestions: parsed.openQuestions,
    glossary: parsed.glossary,
    stakeholders: parsed.stakeholders,
  }
}

async function callOpenAI(
  apiKey: string,
  model: string,
  prompt: string
): Promise<{ success: true; workingMemory: Partial<WorkingMemoryApi> } | { success: false; error: string }> {
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
    return {
      success: false,
      error: `OpenAI API error: ${response.status} ${errorText}`,
    }
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = data.choices?.[0]?.message?.content?.trim()

  if (!content) {
    return {
      success: false,
      error: 'OpenAI returned empty response',
    }
  }

  try {
    const workingMemory = parseOpenAIResponse(content)
    return { success: true, workingMemory }
  } catch (parseErr) {
    return {
      success: false,
      error: `Failed to parse working memory from OpenAI response: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
    }
  }
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
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
    const rawBody = await readJsonBody(req)
    const body = parseRequestBody(rawBody)

    const validation = validateRequest(body)
    if (!validation.valid) {
      json(res, 400, { success: false, error: validation.error })
      return
    }

    const supabaseUrl = getSupabaseUrl(body)!
    const supabaseAnonKey = getSupabaseAnonKey(body)!
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    const { data: messages, error: messagesError } = await supabase
      .from('hal_conversation_messages')
      .select('role, content, sequence')
      .eq('project_id', body.projectId!)
      .eq('agent', body.agent!)
      .order('sequence', { ascending: true })

    if (messagesError) {
      json(res, 200, {
        success: false,
        error: `Failed to fetch conversation messages: ${messagesError.message}`,
      })
      return
    }

    if (!messages || messages.length === 0) {
      json(res, 200, {
        success: false,
        error: 'No conversation messages found.',
      })
      return
    }

    const { data: existingMemory } = await supabase
      .from('hal_conversation_working_memory')
      .select('through_sequence')
      .eq('project_id', body.projectId!)
      .eq('agent', body.agent!)
      .maybeSingle()

    const currentSequence = getCurrentSequence(messages)
    const lastProcessedSequence = existingMemory?.through_sequence ?? 0

    if (!shouldUpdate(body.forceRefresh!, currentSequence, lastProcessedSequence)) {
      const { data: existing } = await supabase
        .from('hal_conversation_working_memory')
        .select('*')
        .eq('project_id', body.projectId!)
        .eq('agent', body.agent!)
        .maybeSingle()

      if (existing) {
        json(res, 200, {
          success: true,
          workingMemory: toApiFormat(existing),
          updated: false,
        })
        return
      }
    }

    const conversationText = formatConversationText(messages)
    const prompt = createWorkingMemoryPrompt(conversationText)
    const openaiResult = await callOpenAI(body.openaiApiKey!, body.openaiModel!, prompt)

    if (openaiResult.success === false) {
      json(res, 200, {
        success: false,
        error: openaiResult.error,
      })
      return
    }

    const workingMemory = openaiResult.workingMemory
    const dbFormat = toDbFormat(workingMemory, body.projectId!, body.agent!, currentSequence)
    const { error: upsertError } = await supabase
      .from('hal_conversation_working_memory')
      .upsert(dbFormat, { onConflict: 'project_id,agent' })

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
        ...toApiFormat(dbFormat),
        lastUpdatedAt: dbFormat.last_updated_at,
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
