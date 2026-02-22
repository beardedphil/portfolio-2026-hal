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

interface ValidatedCredentials {
  projectId: string
  agent: string
  supabaseUrl: string
  supabaseAnonKey: string
  openaiApiKey: string
  openaiModel: string
  forceRefresh: boolean
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


function validateAndExtractCredentials(body: RequestBody): { valid: false; error: string } | { valid: true; credentials: ValidatedCredentials } {
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
    credentials: {
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

function createWorkingMemoryPrompt(conversationText: string): string {
  return `Analyze this conversation and extract structured working memory. Conversation:\n${conversationText}\n\nExtract: Summary (2-3 sentences), Goals, Requirements, Constraints, Decisions, Assumptions, Open Questions, Glossary (JSON object), Stakeholders. Return ONLY valid JSON: {"summary":"...","goals":[],"requirements":[],"constraints":[],"decisions":[],"assumptions":[],"openQuestions":[],"glossary":{},"stakeholders":[]}`
}

function parseOpenAIResponse(content: string): WorkingMemory {
  let jsonStr = content
  const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/s)
  if (jsonMatch) {
    jsonStr = jsonMatch[1]
  }
  return JSON.parse(jsonStr) as WorkingMemory
}

async function callOpenAI(apiKey: string, model: string, prompt: string): Promise<{ success: true; workingMemory: WorkingMemory } | { success: false; error: string }> {
  try {
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
  } catch (err) {
    return {
      success: false,
      error: `OpenAI API request failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

function formatWorkingMemoryResponse(workingMemory: WorkingMemory, throughSequence: number, updated: boolean) {
  return {
    success: true,
    workingMemory: {
      summary: workingMemory.summary || '',
      goals: workingMemory.goals || [],
      requirements: workingMemory.requirements || [],
      constraints: workingMemory.constraints || [],
      decisions: workingMemory.decisions || [],
      assumptions: workingMemory.assumptions || [],
      openQuestions: workingMemory.openQuestions || [],
      glossary: workingMemory.glossary || {},
      stakeholders: workingMemory.stakeholders || [],
      lastUpdatedAt: updated ? new Date().toISOString() : null,
      throughSequence,
    },
    updated,
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
    const body = (await readJsonBody(req)) as RequestBody
    const validation = validateAndExtractCredentials(body)

    if (!validation.valid) {
      json(res, 400, {
        success: false,
        error: validation.error,
      })
      return
    }

    const { credentials } = validation
    const supabase = createClient(credentials.supabaseUrl, credentials.supabaseAnonKey)

    // Fetch conversation messages
    const { data: messages, error: messagesError } = await supabase
      .from('hal_conversation_messages')
      .select('role, content, sequence')
      .eq('project_id', credentials.projectId)
      .eq('agent', credentials.agent)
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

    // Check if we need to update
    const { data: existingMemory } = await supabase
      .from('hal_conversation_working_memory')
      .select('through_sequence')
      .eq('project_id', credentials.projectId)
      .eq('agent', credentials.agent)
      .maybeSingle()

    const currentSequence = messages[messages.length - 1]?.sequence ?? 0
    const lastProcessedSequence = existingMemory?.through_sequence ?? 0

    if (!credentials.forceRefresh && currentSequence <= lastProcessedSequence) {
      // No new messages, return existing memory
      const { data: existing } = await supabase
        .from('hal_conversation_working_memory')
        .select('*')
        .eq('project_id', credentials.projectId)
        .eq('agent', credentials.agent)
        .maybeSingle()

      if (existing) {
        json(res, 200, formatWorkingMemoryResponse(
          {
            summary: existing.summary || '',
            goals: existing.goals || [],
            requirements: existing.requirements || [],
            constraints: existing.constraints || [],
            decisions: existing.decisions || [],
            assumptions: existing.assumptions || [],
            openQuestions: existing.open_questions || [],
            glossary: existing.glossary || {},
            stakeholders: existing.stakeholders || [],
          },
          existing.through_sequence || 0,
          false
        ))
        return
      }
    }

    // Generate working memory using OpenAI
    const conversationText = messages.map((m) => `**${m.role}**: ${m.content}`).join('\n\n')
    const prompt = createWorkingMemoryPrompt(conversationText)
    const openaiResult = await callOpenAI(credentials.openaiApiKey, credentials.openaiModel, prompt)

    if (!openaiResult.success) {
      json(res, 200, {
        success: false,
        error: openaiResult.error,
      })
      return
    }

    // Upsert working memory
    const { error: upsertError } = await supabase
      .from('hal_conversation_working_memory')
      .upsert(
        {
          project_id: credentials.projectId,
          agent: credentials.agent,
          summary: openaiResult.workingMemory.summary || '',
          goals: openaiResult.workingMemory.goals || [],
          requirements: openaiResult.workingMemory.requirements || [],
          constraints: openaiResult.workingMemory.constraints || [],
          decisions: openaiResult.workingMemory.decisions || [],
          assumptions: openaiResult.workingMemory.assumptions || [],
          open_questions: openaiResult.workingMemory.openQuestions || [],
          glossary: openaiResult.workingMemory.glossary || {},
          stakeholders: openaiResult.workingMemory.stakeholders || [],
          through_sequence: currentSequence,
          last_updated_at: new Date().toISOString(),
        },
        { onConflict: 'project_id,agent' }
      )

    if (upsertError) {
      json(res, 200, {
        success: false,
        error: `Failed to save working memory: ${upsertError.message}`,
      })
      return
    }

    json(res, 200, formatWorkingMemoryResponse(openaiResult.workingMemory, currentSequence, true))
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
