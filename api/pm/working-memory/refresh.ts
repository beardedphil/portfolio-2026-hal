import type { IncomingMessage, ServerResponse } from 'http'
import path from 'path'
import { pathToFileURL } from 'url'
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

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') {
    res.statusCode = 405
    res.end('Method Not Allowed')
    return
  }

  try {
    const body = (await readJsonBody(req)) as {
      projectId?: string
      supabaseUrl?: string
      supabaseAnonKey?: string
      agent?: string
    }

    const projectId = typeof body.projectId === 'string' ? body.projectId.trim() || undefined : undefined
    const supabaseUrl = typeof body.supabaseUrl === 'string' ? body.supabaseUrl.trim() || undefined : undefined
    const supabaseAnonKey =
      typeof body.supabaseAnonKey === 'string' ? body.supabaseAnonKey.trim() || undefined : undefined
    const agent = typeof body.agent === 'string' ? body.agent.trim() || 'project-manager' : 'project-manager'

    if (!projectId || !supabaseUrl || !supabaseAnonKey) {
      json(res, 400, {
        success: false,
        error: 'projectId, supabaseUrl, and supabaseAnonKey are required',
      })
      return
    }

    const key = process.env.OPENAI_API_KEY?.trim()
    const model = process.env.OPENAI_MODEL?.trim()

    if (!key || !model) {
      json(res, 503, {
        success: false,
        error: 'OpenAI API is not configured. Set OPENAI_API_KEY and OPENAI_MODEL in env.',
      })
      return
    }

    // Load hal-agents runner
    const repoRoot = process.cwd()
    let runnerModule:
      | {
          generateWorkingMemory?: (
            msgs: unknown[],
            existing: unknown,
            key: string,
            model: string
          ) => Promise<unknown>
        }
      | null = null

    try {
      const runnerDistPath = path.resolve(repoRoot, 'agents/dist/agents/runner.js')
      runnerModule = await import(pathToFileURL(runnerDistPath).href)
    } catch {
      json(res, 503, {
        success: false,
        error: 'hal-agents runner not available (missing dist)',
      })
      return
    }

    if (typeof runnerModule.generateWorkingMemory !== 'function') {
      json(res, 503, {
        success: false,
        error: 'generateWorkingMemory function not available in runner',
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Fetch all messages
    const { data: rows, error: messagesError } = await supabase
      .from('hal_conversation_messages')
      .select('role, content, sequence')
      .eq('project_id', projectId)
      .eq('agent', agent)
      .order('sequence', { ascending: true })

    if (messagesError) {
      json(res, 500, {
        success: false,
        error: `Failed to fetch messages: ${messagesError.message}`,
      })
      return
    }

    const messages = (rows ?? []).map((r: any) => ({
      role: r.role as 'user' | 'assistant',
      content: r.content ?? '',
    }))

    // Fetch existing working memory
    const { data: existingMemory } = await supabase
      .from('hal_pm_working_memory')
      .select('*')
      .eq('project_id', projectId)
      .eq('agent', agent)
      .single()

    // Generate new working memory
    const newMemory = (await runnerModule.generateWorkingMemory(
      messages,
      existingMemory,
      key,
      model
    )) as {
      summary: string
      goals: string[]
      requirements: string[]
      constraints: string[]
      decisions: string[]
      assumptions: string[]
      open_questions: string[]
      glossary: string[]
      stakeholders: string[]
    }

    // Upsert working memory
    const maxSequence = messages.length > 0 ? Math.max(...messages.map((m: any, i: number) => rows?.[i]?.sequence ?? 0)) : 0
    const { data, error: upsertError } = await supabase
      .from('hal_pm_working_memory')
      .upsert(
        {
          project_id: projectId,
          agent,
          summary: newMemory.summary,
          goals: newMemory.goals,
          requirements: newMemory.requirements,
          constraints: newMemory.constraints,
          decisions: newMemory.decisions,
          assumptions: newMemory.assumptions,
          open_questions: newMemory.open_questions,
          glossary: newMemory.glossary,
          stakeholders: newMemory.stakeholders,
          last_sequence: maxSequence,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'project_id,agent' }
      )
      .select()
      .single()

    if (upsertError) {
      json(res, 500, {
        success: false,
        error: `Failed to save working memory: ${upsertError.message}`,
      })
      return
    }

    json(res, 200, {
      success: true,
      workingMemory: data,
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
