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

interface ValidatedInput {
  projectId: string
  agent: string
  supabaseUrl: string
  supabaseAnonKey: string
  openaiApiKey: string
  openaiModel: string
  forceRefresh: boolean
}

function validateAndExtractInput(body: RequestBody): ValidatedInput | { error: string } {
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
    return {
      error: 'OpenAI credentials required (provide openaiApiKey and openaiModel in request body).',
    }
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

async function fetchConversationMessages(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
  agent: string
): Promise<{ messages: Array<{ role: string; content: string; sequence: number }> } | { error: string }> {
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

interface WorkingMemoryRecord {
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
}

async function getExistingWorkingMemory(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
  agent: string
): Promise<WorkingMemoryRecord | null> {
  const { data: existing } = await supabase
    .from('hal_conversation_working_memory')
    .select('*')
    .eq('project_id', projectId)
    .eq('agent', agent)
    .maybeSingle()

  return existing
}

function formatWorkingMemoryResponse(record: WorkingMemoryRecord) {
  return {
    summary: record.summary || '',
    goals: record.goals || [],
    requirements: record.requirements || [],
    constraints: record.constraints || [],
    decisions: record.decisions || [],
    assumptions: record.assumptions || [],
    openQuestions: record.open_questions || [],
    glossary: record.glossary || {},
    stakeholders: record.stakeholders || [],
    lastUpdatedAt: record.last_updated_at || null,
    throughSequence: record.through_sequence || 0,
  }
}

function buildConversationText(messages: Array<{ role: string; content: string }>): string {
  return messages.map((m) => `**${m.role}**: ${m.content}`).join('\n\n')
}

function buildOpenAIPrompt(conversationText: string): string {
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

async function callOpenAI(
  apiKey: string,
  model: string,
  prompt: string
): Promise<WorkingMemoryData | { error: string }> {
  const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
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

  if (!openaiResponse.ok) {
    const errorText = await openaiResponse.text()
    return { error: `OpenAI API error: ${openaiResponse.status} ${errorText}` }
  }

  const openaiData = (await openaiResponse.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = openaiData.choices?.[0]?.message?.content?.trim()

  if (!content) {
    return { error: 'OpenAI returned empty response' }
  }

  // Parse JSON from response (may have markdown code blocks)
  let jsonStr = content
  const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/s)
  if (jsonMatch) {
    jsonStr = jsonMatch[1]
  }

  try {
    return JSON.parse(jsonStr) as WorkingMemoryData
  } catch (parseErr) {
    return {
      error: `Failed to parse working memory from OpenAI response: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
    }
  }
}

async function saveWorkingMemory(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
  agent: string,
  workingMemory: WorkingMemoryData,
  currentSequence: number
): Promise<{ error?: string }> {
  const { error: upsertError } = await supabase.from('hal_conversation_working_memory').upsert(
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

  if (upsertError) {
    return { error: `Failed to save working memory: ${upsertError.message}` }
  }

  return {}
}

function formatWorkingMemoryOutput(workingMemory: WorkingMemoryData, currentSequence: number) {
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
    const input = validateAndExtractInput(body)

    if ('error' in input) {
      json(res, 400, { success: false, error: input.error })
      return
    }

    const supabase = createClient(input.supabaseUrl, input.supabaseAnonKey)

    // Fetch conversation messages
    const messagesResult = await fetchConversationMessages(supabase, input.projectId, input.agent)
    if ('error' in messagesResult) {
      json(res, 200, { success: false, error: messagesResult.error })
      return
    }

    const { messages } = messagesResult
    const currentSequence = messages[messages.length - 1]?.sequence ?? 0

    // Check if we need to update
    const lastProcessedSequence = await getExistingMemorySequence(supabase, input.projectId, input.agent)

    if (!input.forceRefresh && currentSequence <= lastProcessedSequence) {
      // No new messages, return existing memory
      const existing = await getExistingWorkingMemory(supabase, input.projectId, input.agent)
      if (existing) {
        json(res, 200, {
          success: true,
          workingMemory: formatWorkingMemoryResponse(existing),
          updated: false,
        })
        return
      }
    }

    // Generate working memory using OpenAI
    const conversationText = buildConversationText(messages)
    const prompt = buildOpenAIPrompt(conversationText)

    const openaiResult = await callOpenAI(input.openaiApiKey, input.openaiModel, prompt)
    if ('error' in openaiResult) {
      json(res, 200, { success: false, error: openaiResult.error })
      return
    }

    // Save working memory
    const saveResult = await saveWorkingMemory(
      supabase,
      input.projectId,
      input.agent,
      openaiResult,
      currentSequence
    )
    if (saveResult.error) {
      json(res, 200, { success: false, error: saveResult.error })
      return
    }

    json(res, 200, {
      success: true,
      workingMemory: formatWorkingMemoryOutput(openaiResult, currentSequence),
      updated: true,
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
