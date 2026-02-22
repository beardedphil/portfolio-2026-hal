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

interface ParsedRequest {
  projectId: string
  agent: string
  supabaseUrl: string
  supabaseAnonKey: string
  openaiApiKey: string
  openaiModel: string
  forceRefresh: boolean
}

export function parseRequestBody(body: unknown): RequestBody {
  return body as RequestBody
}

function getEnvOrBodyValue(bodyValue: unknown, envKeys: string[]): string | undefined {
  const str = typeof bodyValue === 'string' ? bodyValue.trim() || undefined : undefined
  return str || envKeys.map((k) => process.env[k]?.trim()).find((v) => v) || undefined
}

export function validateAndParseRequest(body: RequestBody): { valid: true; parsed: ParsedRequest } | { valid: false; error: string } {
  const projectId = typeof body.projectId === 'string' ? body.projectId.trim() || undefined : undefined
  const agent = typeof body.agent === 'string' ? body.agent.trim() || undefined : undefined
  const supabaseUrl = getEnvOrBodyValue(body.supabaseUrl, ['SUPABASE_URL', 'VITE_SUPABASE_URL'])
  const supabaseAnonKey = getEnvOrBodyValue(body.supabaseAnonKey, ['SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY'])
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
    parsed: {
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

interface WorkingMemory {
  summary: string
  goals: string[]
  requirements: string[]
  constraints: string[]
  decisions: string[]
  assumptions: string[]
  openQuestions: string[]
  glossary: Record<string, string>
  stakeholders: string[]
}

export function normalizeWorkingMemory(data: {
  summary?: string
  goals?: string[]
  requirements?: string[]
  constraints?: string[]
  decisions?: string[]
  assumptions?: string[]
  openQuestions?: string[]
  glossary?: Record<string, string>
  stakeholders?: string[]
}): WorkingMemory {
  return {
    summary: data.summary || '',
    goals: data.goals || [],
    requirements: data.requirements || [],
    constraints: data.constraints || [],
    decisions: data.decisions || [],
    assumptions: data.assumptions || [],
    openQuestions: data.openQuestions || [],
    glossary: data.glossary || {},
    stakeholders: data.stakeholders || [],
  }
}

export function formatConversationText(messages: Array<{ role: string; content: string }>): string {
  return messages.map((m) => `**${m.role}**: ${m.content}`).join('\n\n')
}

const WORKING_MEMORY_PROMPT_TEMPLATE = `You are analyzing a conversation between a user and a Project Manager agent. Extract and structure key information into a working memory format.

Conversation:
{conversationText}

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

function createWorkingMemoryPrompt(conversationText: string): string {
  return WORKING_MEMORY_PROMPT_TEMPLATE.replace('{conversationText}', conversationText)
}

export function parseJsonFromOpenAIResponse(content: string): string {
  let jsonStr = content.trim()
  // Match JSON in markdown code blocks (using [\s\S] instead of . with s flag for compatibility)
  const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/)
  if (jsonMatch) {
    jsonStr = jsonMatch[1]
  }
  return jsonStr
}

async function callOpenAI(apiKey: string, model: string, prompt: string): Promise<{ success: true; content: string } | { success: false; error: string }> {
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

    return { success: true, content }
  } catch (err) {
    return {
      success: false,
      error: `Failed to call OpenAI API: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

async function fetchMessagesAndCheckExisting(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
  agent: string,
  forceRefresh: boolean
): Promise<
  | { success: true; messages: Array<{ role: string; content: string; sequence: number }>; existingMemory: null }
  | { success: true; messages: null; existingMemory: WorkingMemory & { throughSequence: number; lastUpdatedAt: string | null } }
  | { success: false; error: string }
> {
  const { data: messages, error: messagesError } = await supabase
    .from('hal_conversation_messages')
    .select('role, content, sequence')
    .eq('project_id', projectId)
    .eq('agent', agent)
    .order('sequence', { ascending: true })

  if (messagesError) {
    return { success: false, error: `Failed to fetch conversation messages: ${messagesError.message}` }
  }

  if (!messages || messages.length === 0) {
    return { success: false, error: 'No conversation messages found.' }
  }

  const currentSequence = messages[messages.length - 1]?.sequence ?? 0

  if (!forceRefresh) {
    const { data: existingMemory } = await supabase
      .from('hal_conversation_working_memory')
      .select('through_sequence')
      .eq('project_id', projectId)
      .eq('agent', agent)
      .maybeSingle()

    const lastProcessedSequence = existingMemory?.through_sequence ?? 0

    if (currentSequence <= lastProcessedSequence) {
      const { data: existing } = await supabase
        .from('hal_conversation_working_memory')
        .select('*')
        .eq('project_id', projectId)
        .eq('agent', agent)
        .maybeSingle()

      if (existing) {
        const workingMemory = normalizeWorkingMemory({
          summary: existing.summary,
          goals: existing.goals,
          requirements: existing.requirements,
          constraints: existing.constraints,
          decisions: existing.decisions,
          assumptions: existing.assumptions,
          openQuestions: existing.open_questions,
          glossary: existing.glossary,
          stakeholders: existing.stakeholders,
        })

        return {
          success: true,
          messages: null,
          existingMemory: {
            ...workingMemory,
            throughSequence: existing.through_sequence || 0,
            lastUpdatedAt: existing.last_updated_at || null,
          },
        }
      }
    }
  }

  return { success: true, messages, existingMemory: null }
}

async function generateAndSaveWorkingMemory(
  supabase: ReturnType<typeof createClient>,
  messages: Array<{ role: string; content: string; sequence: number }>,
  projectId: string,
  agent: string,
  openaiApiKey: string,
  openaiModel: string
): Promise<{ success: true; workingMemory: WorkingMemory & { throughSequence: number; lastUpdatedAt: string } } | { success: false; error: string }> {
  const prompt = createWorkingMemoryPrompt(formatConversationText(messages))
  const openaiResult = await callOpenAI(openaiApiKey, openaiModel, prompt)

  if (!openaiResult.success) {
    return { success: false, error: openaiResult.error }
  }

  try {
    const { content } = openaiResult
    const jsonStr = parseJsonFromOpenAIResponse(content)
    const parsedMemory = JSON.parse(jsonStr) as {
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

    const workingMemory = normalizeWorkingMemory(parsedMemory)
    const currentSequence = messages[messages.length - 1]?.sequence ?? 0
    const lastUpdatedAt = new Date().toISOString()

    const { error: upsertError } = await supabase.from('hal_conversation_working_memory').upsert(
      {
        project_id: projectId,
        agent,
        summary: workingMemory.summary,
        goals: workingMemory.goals,
        requirements: workingMemory.requirements,
        constraints: workingMemory.constraints,
        decisions: workingMemory.decisions,
        assumptions: workingMemory.assumptions,
        open_questions: workingMemory.openQuestions,
        glossary: workingMemory.glossary,
        stakeholders: workingMemory.stakeholders,
        through_sequence: currentSequence,
        last_updated_at: lastUpdatedAt,
      },
      { onConflict: 'project_id,agent' }
    )

    if (upsertError) {
      return { success: false, error: `Failed to save working memory: ${upsertError.message}` }
    }

    return {
      success: true,
      workingMemory: { ...workingMemory, throughSequence: currentSequence, lastUpdatedAt },
    }
  } catch (parseErr) {
    return {
      success: false,
      error: `Failed to parse working memory from OpenAI response: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
    }
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
    const body = parseRequestBody(await readJsonBody(req))
    const validation = validateAndParseRequest(body)

    if (!validation.valid) {
      json(res, 400, {
        success: false,
        error: validation.error,
      })
      return
    }

    const { parsed } = validation
    const supabase = createClient(parsed.supabaseUrl, parsed.supabaseAnonKey)

    const fetchResult = await fetchMessagesAndCheckExisting(supabase, parsed.projectId, parsed.agent, parsed.forceRefresh)
    if (!fetchResult.success) {
      json(res, 200, { success: false, error: fetchResult.error })
      return
    }

    if (fetchResult.existingMemory) {
      json(res, 200, {
        success: true,
        workingMemory: fetchResult.existingMemory,
        updated: false,
      })
      return
    }

    const generateResult = await generateAndSaveWorkingMemory(
      supabase,
      fetchResult.messages!,
      parsed.projectId,
      parsed.agent,
      parsed.openaiApiKey,
      parsed.openaiModel
    )

    if (!generateResult.success) {
      json(res, 200, { success: false, error: generateResult.error })
      return
    }

    json(res, 200, {
      success: true,
      workingMemory: generateResult.workingMemory,
      updated: true,
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}