import type { IncomingMessage, ServerResponse } from 'http'

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

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') {
    res.statusCode = 405
    res.end('Method Not Allowed')
    return
  }

  try {
    const body = (await readJsonBody(req)) as {
      projectId?: string
      conversationId?: string
      supabaseUrl?: string
      supabaseAnonKey?: string
      openaiApiKey?: string
      openaiModel?: string
    }

    const projectId = typeof body.projectId === 'string' ? body.projectId.trim() || undefined : undefined
    const conversationId = typeof body.conversationId === 'string' ? body.conversationId.trim() || 'project-manager-1' : 'project-manager-1'
    const supabaseUrl = typeof body.supabaseUrl === 'string' ? body.supabaseUrl.trim() || undefined : undefined
    const supabaseAnonKey = typeof body.supabaseAnonKey === 'string' ? body.supabaseAnonKey.trim() || undefined : undefined
    const openaiApiKey = typeof body.openaiApiKey === 'string' ? body.openaiApiKey.trim() || undefined : undefined
    const openaiModel = typeof body.openaiModel === 'string' ? body.openaiModel.trim() || undefined : undefined

    if (!projectId || !supabaseUrl || !supabaseAnonKey) {
      json(res, 400, { success: false, error: 'projectId, supabaseUrl, and supabaseAnonKey are required' })
      return
    }

    if (!openaiApiKey || !openaiModel) {
      json(res, 400, { success: false, error: 'openaiApiKey and openaiModel are required for refresh' })
      return
    }

    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Fetch all messages for this conversation
    const { data: messages, error: messagesError } = await supabase
      .from('hal_conversation_messages')
      .select('role, content, sequence')
      .eq('project_id', projectId)
      .eq('agent', conversationId)
      .order('sequence', { ascending: true })

    if (messagesError) {
      json(res, 500, { success: false, error: `Failed to fetch messages: ${messagesError.message}` })
      return
    }

    if (!messages || messages.length === 0) {
      json(res, 200, {
        success: true,
        data: {
          project_id: projectId,
          conversation_id: conversationId,
          summary: 'No messages yet',
          goals: [],
          requirements: [],
          constraints: [],
          decisions: [],
          assumptions: [],
          open_questions: [],
          glossary: {},
          stakeholders: [],
          last_updated: new Date().toISOString(),
        },
        message: 'No messages to process',
      })
      return
    }

    // Load hal-agents runner to use extractWorkingMemory function
    const path = await import('path')
    const { pathToFileURL } = await import('url')
    const repoRoot = process.cwd()
    let runnerModule: {
      extractWorkingMemory?: (messages: unknown[], key: string, model: string) => Promise<{
        summary?: string
        goals?: string[]
        requirements?: string[]
        constraints?: string[]
        decisions?: string[]
        assumptions?: string[]
        open_questions?: string[]
        glossary?: Record<string, string>
        stakeholders?: string[]
      }>
    } | null = null

    try {
      const runnerDistPath = path.resolve(repoRoot, 'agents/dist/agents/runner.js')
      runnerModule = await import(pathToFileURL(runnerDistPath).href)
    } catch {
      // Runner not available - we'll use a fallback
    }

    // Extract working memory using LLM
    let workingMemory: {
      summary?: string
      goals?: string[]
      requirements?: string[]
      constraints?: string[]
      decisions?: string[]
      assumptions?: string[]
      open_questions?: string[]
      glossary?: Record<string, string>
      stakeholders?: string[]
    } = {}

    if (runnerModule?.extractWorkingMemory) {
      try {
        workingMemory = await runnerModule.extractWorkingMemory(messages, openaiApiKey, openaiModel)
      } catch (err) {
        console.error('[PM Working Memory] Failed to extract working memory:', err)
        // Continue with empty structure - will be populated on next refresh
      }
    } else {
      // Fallback: use OpenAI directly to extract working memory
      try {
        const prompt = `You are analyzing a Project Manager conversation to extract key information for working memory.

Extract and structure the following information from the conversation:
- Summary: A concise 2-3 sentence summary of the conversation context
- Goals: Array of project goals discussed
- Requirements: Array of requirements identified
- Constraints: Array of constraints mentioned
- Decisions: Array of decisions made
- Assumptions: Array of assumptions noted
- Open Questions: Array of open questions
- Glossary: Object mapping terms to definitions (key-value pairs)
- Stakeholders: Array of stakeholders mentioned

Conversation messages:
${messages.map((m) => `**${m.role}**: ${m.content}`).join('\n\n')}

Return a JSON object with these fields. Use empty arrays/objects if no information is found for a field.`

        const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${openaiApiKey}`,
          },
          body: JSON.stringify({
            model: openaiModel,
            messages: [
              {
                role: 'system',
                content: 'You are a helpful assistant that extracts structured information from conversations. Always return valid JSON.',
              },
              { role: 'user', content: prompt },
            ],
            temperature: 0.3,
            response_format: { type: 'json_object' },
          }),
        })

        if (!openaiRes.ok) {
          throw new Error(`OpenAI API error: ${openaiRes.status} ${openaiRes.statusText}`)
        }

        const openaiData = (await openaiRes.json()) as { choices?: Array<{ message?: { content?: string } }> }
        const content = openaiData.choices?.[0]?.message?.content
        if (content) {
          workingMemory = JSON.parse(content)
        }
      } catch (err) {
        console.error('[PM Working Memory] Failed to extract working memory via OpenAI:', err)
        // Continue with empty structure
      }
    }

    // Upsert working memory
    const { data: updated, error: updateError } = await supabase
      .from('hal_pm_working_memory')
      .upsert(
        {
          project_id: projectId,
          conversation_id: conversationId,
          summary: workingMemory.summary || null,
          goals: workingMemory.goals || [],
          requirements: workingMemory.requirements || [],
          constraints: workingMemory.constraints || [],
          decisions: workingMemory.decisions || [],
          assumptions: workingMemory.assumptions || [],
          open_questions: workingMemory.open_questions || [],
          glossary: workingMemory.glossary || {},
          stakeholders: workingMemory.stakeholders || [],
          last_updated: new Date().toISOString(),
        },
        { onConflict: 'project_id,conversation_id' }
      )
      .select()
      .single()

    if (updateError) {
      json(res, 500, { success: false, error: `Failed to update working memory: ${updateError.message}` })
      return
    }

    json(res, 200, { success: true, data: updated })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
