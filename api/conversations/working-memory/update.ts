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

function setCorsHeaders(res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
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

function validateAndExtractInput(body: RequestBody): { valid: true; input: ValidatedInput } | { valid: false; error: string } {
  const projectId = typeof body.projectId === 'string' ? body.projectId.trim() || undefined : undefined
  const agent = typeof body.agent === 'string' ? body.agent.trim() || undefined : undefined

  if (!projectId || !agent) {
    return { valid: false, error: 'projectId and agent are required.' }
  }

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

  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      valid: false,
      error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
    }
  }

  const openaiApiKey = typeof body.openaiApiKey === 'string' ? body.openaiApiKey.trim() : undefined
  const openaiModel = typeof body.openaiModel === 'string' ? body.openaiModel.trim() : undefined

  if (!openaiApiKey || !openaiModel) {
    return { valid: false, error: 'OpenAI credentials required (provide openaiApiKey and openaiModel in request body).' }
  }

  const forceRefresh = typeof body.forceRefresh === 'boolean' ? body.forceRefresh : false

  return {
    valid: true,
    input: {
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

async function fetchConversationMessages(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
  agent: string
): Promise<{ success: true; messages: Array<{ role: string; content: string; sequence: number }> } | { success: false; error: string }> {
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

  return { success: true, messages }
}

async function getLastProcessedSequence(
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

  return existing as WorkingMemoryRecord | null
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

interface WorkingMemoryInput {
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

async function callOpenAI(apiKey: string, model: string, prompt: string): Promise<{ success: true; content: string } | { success: false; error: string }> {
  try {
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
      return { success: false, error: `OpenAI API error: ${openaiResponse.status} ${errorText}` }
    }

    const openaiData = (await openaiResponse.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = openaiData.choices?.[0]?.message?.content?.trim()

    if (!content) {
      return { success: false, error: 'OpenAI returned empty response' }
    }

    return { success: true, content }
  } catch (err) {
    return {
      success: false,
      error: `Failed to call OpenAI API: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

function parseWorkingMemoryFromContent(content: string): { success: true; workingMemory: WorkingMemoryInput } | { success: false; error: string } {
  try {
    // Parse JSON from response (may have markdown code blocks)
    let jsonStr = content
    const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/s)
    if (jsonMatch) {
      jsonStr = jsonMatch[1]
    }

    const workingMemory = JSON.parse(jsonStr) as WorkingMemoryInput
    return { success: true, workingMemory }
  } catch (parseErr) {
    return {
      success: false,
      error: `Failed to parse working memory from OpenAI response: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
    }
  }
}

async function saveWorkingMemory(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
  agent: string,
  workingMemory: WorkingMemoryInput,
  currentSequence: number
): Promise<{ success: true } | { success: false; error: string }> {
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
    return { success: false, error: `Failed to save working memory: ${upsertError.message}` }
  }

  return { success: true }
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

    const validation = validateAndExtractInput(body)
    if (!validation.valid) {
      json(res, 400, { success: false, error: validation.error })
      return
    }

    const { projectId, agent, supabaseUrl, supabaseAnonKey, openaiApiKey, openaiModel, forceRefresh } = validation.input
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    const messagesResult = await fetchConversationMessages(supabase, projectId, agent)
    if (!messagesResult.success) {
      json(res, 200, { success: false, error: messagesResult.error })
      return
    }

    const messages = messagesResult.messages
    const currentSequence = messages[messages.length - 1]?.sequence ?? 0
    const lastProcessedSequence = await getLastProcessedSequence(supabase, projectId, agent)

    if (!forceRefresh && currentSequence <= lastProcessedSequence) {
      // No new messages, return existing memory
      const existing = await getExistingWorkingMemory(supabase, projectId, agent)
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
    const prompt = buildConversationPrompt(messages)
    const openaiResult = await callOpenAI(openaiApiKey, openaiModel, prompt)
    if (!openaiResult.success) {
      json(res, 200, { success: false, error: openaiResult.error })
      return
    }

    const parseResult = parseWorkingMemoryFromContent(openaiResult.content)
    if (!parseResult.success) {
      json(res, 200, { success: false, error: parseResult.error })
      return
    }

    const saveResult = await saveWorkingMemory(supabase, projectId, agent, parseResult.workingMemory, currentSequence)
    if (!saveResult.success) {
      json(res, 200, { success: false, error: saveResult.error })
      return
    }

    json(res, 200, {
      success: true,
      workingMemory: {
        summary: parseResult.workingMemory.summary || '',
        goals: parseResult.workingMemory.goals || [],
        requirements: parseResult.workingMemory.requirements || [],
        constraints: parseResult.workingMemory.constraints || [],
        decisions: parseResult.workingMemory.decisions || [],
        assumptions: parseResult.workingMemory.assumptions || [],
        openQuestions: parseResult.workingMemory.openQuestions || [],
        glossary: parseResult.workingMemory.glossary || {},
        stakeholders: parseResult.workingMemory.stakeholders || [],
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
