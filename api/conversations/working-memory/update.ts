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

interface WorkingMemoryResponse {
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

function parseRequestBody(body: unknown): RequestBody {
  const parsed = body as RequestBody
  return {
    projectId: typeof parsed.projectId === 'string' ? parsed.projectId.trim() || undefined : undefined,
    agent: typeof parsed.agent === 'string' ? parsed.agent.trim() || undefined : undefined,
    supabaseUrl:
      (typeof parsed.supabaseUrl === 'string' ? parsed.supabaseUrl.trim() : undefined) ||
      process.env.SUPABASE_URL?.trim() ||
      process.env.VITE_SUPABASE_URL?.trim() ||
      undefined,
    supabaseAnonKey:
      (typeof parsed.supabaseAnonKey === 'string' ? parsed.supabaseAnonKey.trim() : undefined) ||
      process.env.SUPABASE_ANON_KEY?.trim() ||
      process.env.VITE_SUPABASE_ANON_KEY?.trim() ||
      undefined,
    openaiApiKey: typeof parsed.openaiApiKey === 'string' ? parsed.openaiApiKey.trim() : undefined,
    openaiModel: typeof parsed.openaiModel === 'string' ? parsed.openaiModel.trim() : undefined,
    forceRefresh: typeof parsed.forceRefresh === 'boolean' ? parsed.forceRefresh : false,
  }
}

function validateRequest(params: {
  projectId?: string
  agent?: string
  supabaseUrl?: string
  supabaseAnonKey?: string
  openaiApiKey?: string
  openaiModel?: string
}): string | null {
  if (!params.projectId || !params.agent) {
    return 'projectId and agent are required.'
  }
  if (!params.supabaseUrl || !params.supabaseAnonKey) {
    return 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).'
  }
  if (!params.openaiApiKey || !params.openaiModel) {
    return 'OpenAI credentials required (provide openaiApiKey and openaiModel in request body).'
  }
  return null
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

function parseOpenAIResponse(content: string): WorkingMemoryData {
  let jsonStr = content
  const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/s)
  if (jsonMatch) {
    jsonStr = jsonMatch[1]
  }
  return JSON.parse(jsonStr) as WorkingMemoryData
}

function transformToApiFormat(data: {
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
}): WorkingMemoryResponse {
  return {
    summary: data.summary || '',
    goals: data.goals || [],
    requirements: data.requirements || [],
    constraints: data.constraints || [],
    decisions: data.decisions || [],
    assumptions: data.assumptions || [],
    openQuestions: data.open_questions || [],
    glossary: data.glossary || {},
    stakeholders: data.stakeholders || [],
    lastUpdatedAt: data.last_updated_at || null,
    throughSequence: data.through_sequence || 0,
  }
}

function transformToDbFormat(
  data: WorkingMemoryData,
  projectId: string,
  agent: string,
  throughSequence: number
) {
  return {
    project_id: projectId,
    agent,
    summary: data.summary || '',
    goals: data.goals || [],
    requirements: data.requirements || [],
    constraints: data.constraints || [],
    decisions: data.decisions || [],
    assumptions: data.assumptions || [],
    open_questions: data.openQuestions || [],
    glossary: data.glossary || {},
    stakeholders: data.stakeholders || [],
    through_sequence: throughSequence,
    last_updated_at: new Date().toISOString(),
  }
}

async function fetchMessages(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
  agent: string
) {
  const { data, error } = await supabase
    .from('hal_conversation_messages')
    .select('role, content, sequence')
    .eq('project_id', projectId)
    .eq('agent', agent)
    .order('sequence', { ascending: true })

  if (error) {
    return { messages: null, error: `Failed to fetch conversation messages: ${error.message}` }
  }
  if (!data || data.length === 0) {
    return { messages: null, error: 'No conversation messages found.' }
  }
  return { messages: data, error: null }
}

async function checkIfUpdateNeeded(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
  agent: string,
  currentSequence: number,
  forceRefresh: boolean
) {
  if (forceRefresh) {
    return { needsUpdate: true, existingMemory: null }
  }

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

    return { needsUpdate: false, existingMemory: existing }
  }

  return { needsUpdate: true, existingMemory: null }
}

async function callOpenAI(apiKey: string, model: string, prompt: string) {
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
    return { data: null, error: `OpenAI API error: ${response.status} ${errorText}` }
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = data.choices?.[0]?.message?.content?.trim()

  if (!content) {
    return { data: null, error: 'OpenAI returned empty response' }
  }

  try {
    const workingMemory = parseOpenAIResponse(content)
    return { data: workingMemory, error: null }
  } catch (parseErr) {
    return {
      data: null,
      error: `Failed to parse working memory from OpenAI response: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
    }
  }
}

async function saveWorkingMemory(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
  agent: string,
  workingMemory: WorkingMemoryData,
  throughSequence: number
) {
  const dbData = transformToDbFormat(workingMemory, projectId, agent, throughSequence)
  const { error } = await supabase
    .from('hal_conversation_working_memory')
    .upsert(dbData, { onConflict: 'project_id,agent' })

  if (error) {
    return { error: `Failed to save working memory: ${error.message}` }
  }
  return { error: null }
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
    const rawBody = await readJsonBody(req)
    const params = parseRequestBody(rawBody)

    const validationError = validateRequest(params)
    if (validationError) {
      json(res, 400, { success: false, error: validationError })
      return
    }

    const { projectId, agent, supabaseUrl, supabaseAnonKey, openaiApiKey, openaiModel, forceRefresh } = params
    const supabase = createClient(supabaseUrl!, supabaseAnonKey!)

    const { messages, error: messagesError } = await fetchMessages(supabase, projectId!, agent!)
    if (messagesError) {
      json(res, 200, { success: false, error: messagesError })
      return
    }

    const currentSequence = messages![messages!.length - 1]?.sequence ?? 0
    const { needsUpdate, existingMemory } = await checkIfUpdateNeeded(
      supabase,
      projectId!,
      agent!,
      currentSequence,
      forceRefresh!
    )

    if (!needsUpdate && existingMemory) {
      json(res, 200, {
        success: true,
        workingMemory: transformToApiFormat(existingMemory),
        updated: false,
      })
      return
    }

    const prompt = buildConversationPrompt(messages!)
    const { data: workingMemory, error: openaiError } = await callOpenAI(openaiApiKey!, openaiModel!, prompt)

    if (openaiError) {
      json(res, 200, { success: false, error: openaiError })
      return
    }

    const { error: saveError } = await saveWorkingMemory(
      supabase,
      projectId!,
      agent!,
      workingMemory!,
      currentSequence
    )

    if (saveError) {
      json(res, 200, { success: false, error: saveError })
      return
    }

    const apiFormat: WorkingMemoryResponse = {
      summary: workingMemory!.summary || '',
      goals: workingMemory!.goals || [],
      requirements: workingMemory!.requirements || [],
      constraints: workingMemory!.constraints || [],
      decisions: workingMemory!.decisions || [],
      assumptions: workingMemory!.assumptions || [],
      openQuestions: workingMemory!.openQuestions || [],
      glossary: workingMemory!.glossary || {},
      stakeholders: workingMemory!.stakeholders || [],
      lastUpdatedAt: new Date().toISOString(),
      throughSequence: currentSequence,
    }

    json(res, 200, {
      success: true,
      workingMemory: apiFormat,
      updated: true,
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}