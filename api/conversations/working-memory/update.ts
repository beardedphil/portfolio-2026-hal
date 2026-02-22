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

function getEnvOrBodyValue(bodyValue: unknown, envKeys: string[]): string | undefined {
  const str = typeof bodyValue === 'string' ? bodyValue.trim() || undefined : undefined
  return str || envKeys.map((k) => process.env[k]?.trim()).find((v) => v) || undefined
}

function validateAndParseRequest(body: RequestBody): { valid: true; parsed: ParsedRequest } | { valid: false; error: string } {
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

function normalizeWorkingMemory(data: {
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

function formatConversationText(messages: Array<{ role: string; content: string }>): string {
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

function parseJsonFromOpenAIResponse(content: string): string {
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

function formatWorkingMemoryResponse(workingMemory: WorkingMemory, throughSequence: number, lastUpdatedAt: string | null) {
  return {
    summary: workingMemory.summary,
    goals: workingMemory.goals,
    requirements: workingMemory.requirements,
    constraints: workingMemory.constraints,
    decisions: workingMemory.decisions,
    assumptions: workingMemory.assumptions,
    openQuestions: workingMemory.openQuestions,
    glossary: workingMemory.glossary,
    stakeholders: workingMemory.stakeholders,
    lastUpdatedAt,
    throughSequence,
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
      const errorResult = validation as { valid: false; error: string }
      json(res, 400, {
        success: false,
        error: errorResult.error,
      })
      return
    }

    const { parsed } = validation as { valid: true; parsed: ParsedRequest }
    const supabase = createClient(parsed.supabaseUrl, parsed.supabaseAnonKey)

    // Fetch conversation messages
    const { data: messages, error: messagesError } = await supabase
      .from('hal_conversation_messages')
      .select('role, content, sequence')
      .eq('project_id', parsed.projectId)
      .eq('agent', parsed.agent)
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

    // Check if we need to update (if forceRefresh is true, or if there are new messages)
    const { data: existingMemory } = await supabase
      .from('hal_conversation_working_memory')
      .select('through_sequence')
      .eq('project_id', parsed.projectId)
      .eq('agent', parsed.agent)
      .maybeSingle()

    const currentSequence = messages[messages.length - 1]?.sequence ?? 0
    const lastProcessedSequence = existingMemory?.through_sequence ?? 0

    if (!parsed.forceRefresh && currentSequence <= lastProcessedSequence) {
      // No new messages, return existing memory
      const { data: existing } = await supabase
        .from('hal_conversation_working_memory')
        .select('*')
        .eq('project_id', parsed.projectId)
        .eq('agent', parsed.agent)
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

        json(res, 200, {
          success: true,
          workingMemory: formatWorkingMemoryResponse(workingMemory, existing.through_sequence || 0, existing.last_updated_at || null),
          updated: false,
        })
        return
      }
    }

    // Generate working memory using OpenAI
    const prompt = createWorkingMemoryPrompt(formatConversationText(messages))

    const openaiResult = await callOpenAI(parsed.openaiApiKey, parsed.openaiModel, prompt)

    if (!openaiResult.success) {
      const errorResult = openaiResult as { success: false; error: string }
      json(res, 200, {
        success: false,
        error: errorResult.error,
      })
      return
    }

    try {
      const { content } = openaiResult as { success: true; content: string }
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

      // Upsert working memory
      const { error: upsertError } = await supabase
        .from('hal_conversation_working_memory')
        .upsert(
          {
            project_id: parsed.projectId,
            agent: parsed.agent,
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

      const lastUpdatedAt = new Date().toISOString()
      json(res, 200, {
        success: true,
        workingMemory: formatWorkingMemoryResponse(workingMemory, currentSequence, lastUpdatedAt),
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