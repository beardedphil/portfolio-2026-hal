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

interface ParsedCredentials {
  projectId: string
  agent: string
  supabaseUrl: string
  supabaseAnonKey: string
  openaiApiKey: string
  openaiModel: string
  forceRefresh: boolean
}

function parseCredentials(body: RequestBody): ParsedCredentials {
  const projectId = typeof body.projectId === 'string' ? body.projectId.trim() || undefined : undefined
  const agent = typeof body.agent === 'string' ? body.agent.trim() || undefined : undefined
  const supabaseUrl =
    (typeof body.supabaseUrl === 'string' ? body.supabaseUrl.trim() : undefined) ||
    process.env.SUPABASE_URL?.trim() ||
    process.env.VITE_SUPABASE_URL?.trim() ||
    undefined
  const supabaseAnonKey =
    (typeof body.supabaseAnonKey === 'string' ? body.supabaseAnonKey.trim() : undefined) ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.VITE_SUPABASE_ANON_KEY?.trim() ||
    undefined
  const openaiApiKey = typeof body.openaiApiKey === 'string' ? body.openaiApiKey.trim() : undefined
  const openaiModel = typeof body.openaiModel === 'string' ? body.openaiModel.trim() : undefined
  const forceRefresh = typeof body.forceRefresh === 'boolean' ? body.forceRefresh : false

  return { projectId, agent, supabaseUrl, supabaseAnonKey, openaiApiKey, openaiModel, forceRefresh } as ParsedCredentials
}

function validateCredentials(creds: ParsedCredentials, res: ServerResponse): boolean {
  if (!creds.projectId || !creds.agent) {
    json(res, 400, {
      success: false,
      error: 'projectId and agent are required.',
    })
    return false
  }

  if (!creds.supabaseUrl || !creds.supabaseAnonKey) {
    json(res, 400, {
      success: false,
      error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
    })
    return false
  }

  if (!creds.openaiApiKey || !creds.openaiModel) {
    json(res, 400, {
      success: false,
      error: 'OpenAI credentials required (provide openaiApiKey and openaiModel in request body).',
    })
    return false
  }

  return true
}

async function fetchMessages(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
  agent: string
): Promise<{ data: Array<{ role: string; content: string; sequence: number }> | null; error: { message: string } | null }> {
  return await supabase
    .from('hal_conversation_messages')
    .select('role, content, sequence')
    .eq('project_id', projectId)
    .eq('agent', agent)
    .order('sequence', { ascending: true })
}

async function getExistingMemorySequence(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
  agent: string
): Promise<number> {
  const { data: existingMemory } = await supabase
    .from('hal_conversation_working_memory')
    .select('through_sequence')
    .eq('project_id', projectId)
    .eq('agent', agent)
    .maybeSingle()
  return existingMemory?.through_sequence ?? 0
}

async function getExistingMemory(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
  agent: string
): Promise<{
  summary: string
  goals: string[]
  requirements: string[]
  constraints: string[]
  decisions: string[]
  assumptions: string[]
  open_questions: string[]
  glossary: Record<string, string>
  stakeholders: string[]
  last_updated_at: string | null
  through_sequence: number
} | null> {
  const { data: existing } = await supabase
    .from('hal_conversation_working_memory')
    .select('*')
    .eq('project_id', projectId)
    .eq('agent', agent)
    .maybeSingle()
  return existing
}

function formatWorkingMemoryResponse(existing: Awaited<ReturnType<typeof getExistingMemory>>) {
  if (!existing) return null
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

function buildConversationPrompt(messages: Array<{ role: string; content: string }>): string {
  const conversationText = messages.map((m) => `**${m.role}**: ${m.content}`).join('\n\n')
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

async function callOpenAI(openaiApiKey: string, openaiModel: string, prompt: string): Promise<string> {
  const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
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

  if (!openaiResponse.ok) {
    const errorText = await openaiResponse.text()
    throw new Error(`OpenAI API error: ${openaiResponse.status} ${errorText}`)
  }

  const openaiData = (await openaiResponse.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = openaiData.choices?.[0]?.message?.content?.trim()

  if (!content) {
    throw new Error('OpenAI returned empty response')
  }

  return content
}

function parseWorkingMemoryFromResponse(content: string): {
  summary?: string
  goals?: string[]
  requirements?: string[]
  constraints?: string[]
  decisions?: string[]
  assumptions?: string[]
  openQuestions?: string[]
  glossary?: Record<string, string>
  stakeholders?: string[]
} {
  let jsonStr = content
  const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/s)
  if (jsonMatch) {
    jsonStr = jsonMatch[1]
  }

  return JSON.parse(jsonStr) as {
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
}

function transformWorkingMemoryForDatabase(
  workingMemory: ReturnType<typeof parseWorkingMemoryFromResponse>,
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

function transformWorkingMemoryForResponse(
  workingMemory: ReturnType<typeof parseWorkingMemoryFromResponse>,
  currentSequence: number
) {
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
    const creds = parseCredentials(body)
    if (!validateCredentials(creds, res)) {
      return
    }

    const supabase = createClient(creds.supabaseUrl, creds.supabaseAnonKey)

    // Fetch conversation messages
    const { data: messages, error: messagesError } = await fetchMessages(supabase, creds.projectId, creds.agent)

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

    // Check if we need to update
    const currentSequence = messages[messages.length - 1]?.sequence ?? 0
    const lastProcessedSequence = await getExistingMemorySequence(supabase, creds.projectId, creds.agent)

    if (!creds.forceRefresh && currentSequence <= lastProcessedSequence) {
      // No new messages, return existing memory
      const existing = await getExistingMemory(supabase, creds.projectId, creds.agent)
      const formatted = formatWorkingMemoryResponse(existing)
      if (formatted) {
        json(res, 200, {
          success: true,
          workingMemory: formatted,
          updated: false,
        })
        return
      }
    }

    // Generate working memory using OpenAI
    const prompt = buildConversationPrompt(messages)
    let workingMemory: ReturnType<typeof parseWorkingMemoryFromResponse>

    try {
      const content = await callOpenAI(creds.openaiApiKey, creds.openaiModel, prompt)
      try {
        workingMemory = parseWorkingMemoryFromResponse(content)
      } catch (parseErr) {
        json(res, 200, {
          success: false,
          error: `Failed to parse working memory from OpenAI response: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
        })
        return
      }
    } catch (openaiErr) {
      json(res, 200, {
        success: false,
        error: openaiErr instanceof Error ? openaiErr.message : String(openaiErr),
      })
      return
    }

    // Upsert working memory
    const memoryData = transformWorkingMemoryForDatabase(workingMemory, creds.projectId, creds.agent, currentSequence)
    const { error: upsertError } = await supabase
      .from('hal_conversation_working_memory')
      .upsert(memoryData, { onConflict: 'project_id,agent' })

    if (upsertError) {
      json(res, 200, {
        success: false,
        error: `Failed to save working memory: ${upsertError.message}`,
      })
      return
    }

    json(res, 200, {
      success: true,
      workingMemory: transformWorkingMemoryForResponse(workingMemory, currentSequence),
      updated: true,
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
