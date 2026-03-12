import type { IncomingMessage, ServerResponse } from 'http'
import type { SupabaseClient } from '@supabase/supabase-js'
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

function setCorsHeaders(res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

function parseRequestBody(body: RequestBody): ParsedRequest | { error: string } {
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

  if (!projectId || !agent) {
    return { error: 'projectId and agent are required.' }
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
    }
  }

  if (!openaiApiKey || !openaiModel) {
    return { error: 'OpenAI credentials required (provide openaiApiKey and openaiModel in request body).' }
  }

  return { projectId, agent, supabaseUrl, supabaseAnonKey, openaiApiKey, openaiModel, forceRefresh }
}

async function fetchMessages(
  supabase: SupabaseClient,
  projectId: string,
  agent: string
): Promise<{ data: Array<{ role: string; content: string; sequence: number }> | null; error: any }> {
  return await supabase
    .from('hal_conversation_messages')
    .select('role, content, sequence')
    .eq('project_id', projectId)
    .eq('agent', agent)
    .order('sequence', { ascending: true })
}

async function fetchExistingMemorySequence(
  supabase: SupabaseClient,
  projectId: string,
  agent: string
): Promise<{ data: { through_sequence: number } | null; error: any }> {
  return await supabase
    .from('hal_conversation_working_memory')
    .select('through_sequence')
    .eq('project_id', projectId)
    .eq('agent', agent)
    .maybeSingle()
}

async function fetchFullExistingMemory(
  supabase: SupabaseClient,
  projectId: string,
  agent: string
): Promise<{
  data: {
    summary: string | null
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
  } | null
  error: any
}> {
  return await supabase
    .from('hal_conversation_working_memory')
    .select('*')
    .eq('project_id', projectId)
    .eq('agent', agent)
    .maybeSingle()
}

function formatWorkingMemoryResponse(existing: {
  summary: string | null
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
}) {
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

function buildConversationText(messages: Array<{ role: string; content: string }>): string {
  return messages.map((m) => `**${m.role}**: ${m.content}`).join('\n\n')
}

const OPENAI_PROMPT_TEMPLATE = `Analyze this PM agent conversation and extract structured working memory.

Conversation:
{conversation}

Extract: Summary (2-3 sentences), Goals, Requirements, Constraints, Decisions, Assumptions, Open Questions, Glossary (JSON object), Stakeholders.

Return ONLY valid JSON:
{"summary":"...","goals":["..."],"requirements":["..."],"constraints":["..."],"decisions":["..."],"assumptions":["..."],"openQuestions":["..."],"glossary":{"term":"def"},"stakeholders":["..."]}`

function buildOpenAIPrompt(conversationText: string): string {
  return OPENAI_PROMPT_TEMPLATE.replace('{conversation}', conversationText)
}

async function callOpenAI(apiKey: string, model: string, prompt: string): Promise<string> {
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

  return content
}

function parseWorkingMemoryFromResponse(content: string): WorkingMemory {
  let jsonStr = content
  const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/)
  if (jsonMatch) {
    jsonStr = jsonMatch[1]
  }

  return JSON.parse(jsonStr) as WorkingMemory
}

async function saveWorkingMemory(
  supabase: SupabaseClient,
  projectId: string,
  agent: string,
  workingMemory: WorkingMemory,
  currentSequence: number
): Promise<{ error: any }> {
  return await supabase
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
        through_sequence: currentSequence,
        last_updated_at: new Date().toISOString(),
      },
      { onConflict: 'project_id,agent' }
    )
}

function formatWorkingMemoryOutput(workingMemory: WorkingMemory, currentSequence: number) {
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
    const parsed = parseRequestBody(body)

    if ('error' in parsed) {
      json(res, 400, {
        success: false,
        error: parsed.error,
      })
      return
    }

    const { projectId, agent, supabaseUrl, supabaseAnonKey, openaiApiKey, openaiModel, forceRefresh } = parsed
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    const { data: messages, error: messagesError } = await fetchMessages(supabase, projectId, agent)

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

    const { data: existingMemory } = await fetchExistingMemorySequence(supabase, projectId, agent)
    const currentSequence = messages[messages.length - 1]?.sequence ?? 0
    const lastProcessedSequence = existingMemory?.through_sequence ?? 0

    if (!forceRefresh && currentSequence <= lastProcessedSequence) {
      const { data: existing } = await fetchFullExistingMemory(supabase, projectId, agent)

      if (existing) {
        json(res, 200, {
          success: true,
          workingMemory: formatWorkingMemoryResponse(existing),
          updated: false,
        })
        return
      }
    }

    const conversationText = buildConversationText(messages)
    const prompt = buildOpenAIPrompt(conversationText)

    try {
      const openaiContent = await callOpenAI(openaiApiKey, openaiModel, prompt)
      const workingMemory = parseWorkingMemoryFromResponse(openaiContent)

      const { error: upsertError } = await saveWorkingMemory(
        supabase,
        projectId,
        agent,
        workingMemory,
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
        workingMemory: formatWorkingMemoryOutput(workingMemory, currentSequence),
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