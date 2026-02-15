import type { IncomingMessage, ServerResponse } from 'http'
import path from 'path'
import { pathToFileURL } from 'url'

type RefreshMemoryResponse = {
  success: boolean
  error?: string
  workingMemory?: {
    summary: string
    goals: string[]
    requirements: string[]
    constraints: string[]
    decisions: string[]
    assumptions: string[]
    open_questions: string[]
    glossary: Record<string, string>
    stakeholders: string[]
    updated_at: string
  }
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
    }

    const projectId =
      typeof body.projectId === 'string' ? body.projectId.trim() || undefined : undefined
    const supabaseUrl =
      typeof body.supabaseUrl === 'string' ? body.supabaseUrl.trim() || undefined : undefined
    const supabaseAnonKey =
      typeof body.supabaseAnonKey === 'string'
        ? body.supabaseAnonKey.trim() || undefined
        : undefined

    if (!projectId || !supabaseUrl || !supabaseAnonKey) {
      json(res, 400, {
        success: false,
        error: 'projectId, supabaseUrl, and supabaseAnonKey are required',
      } satisfies RefreshMemoryResponse)
      return
    }

    const key = process.env.OPENAI_API_KEY?.trim()
    const model = process.env.OPENAI_MODEL?.trim()

    if (!key || !model) {
      json(res, 503, {
        success: false,
        error: 'OpenAI API is not configured. Set OPENAI_API_KEY and OPENAI_MODEL in env.',
      } satisfies RefreshMemoryResponse)
      return
    }

    // Load hal-agents runner
    const repoRoot = process.cwd()
    let runnerModule:
      | {
          generateWorkingMemory?: (
            msgs: unknown[],
            existing: any,
            key: string,
            model: string
          ) => Promise<any>
        }
      | null = null

    try {
      const runnerDistPath = path.resolve(repoRoot, 'agents/dist/agents/runner.js')
      runnerModule = await import(pathToFileURL(runnerDistPath).href)
    } catch {
      runnerModule = null
    }

    if (!runnerModule?.generateWorkingMemory) {
      json(res, 503, {
        success: false,
        error: 'Working memory generation not available (hal-agents runner not found)',
      } satisfies RefreshMemoryResponse)
      return
    }

    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Fetch all conversation messages
    const { data: rows, error: fetchError } = await supabase
      .from('hal_conversation_messages')
      .select('role, content, sequence')
      .eq('project_id', projectId)
      .eq('agent', 'project-manager')
      .order('sequence', { ascending: true })

    if (fetchError) {
      json(res, 500, {
        success: false,
        error: `Failed to fetch messages: ${fetchError.message}`,
      } satisfies RefreshMemoryResponse)
      return
    }

    const messages = (rows ?? []).map((r: any) => ({
      role: r.role as 'user' | 'assistant',
      content: r.content ?? '',
    }))

    if (messages.length === 0) {
      json(res, 400, {
        success: false,
        error: 'No conversation messages found',
      } satisfies RefreshMemoryResponse)
      return
    }

    // Load existing working memory
    let existingMemory: any = null
    try {
      const { data: memoryRow } = await supabase
        .from('hal_pm_working_memory')
        .select('*')
        .eq('project_id', projectId)
        .eq('agent', 'project-manager')
        .single()

      if (memoryRow) {
        existingMemory = {
          summary: memoryRow.summary || '',
          goals: memoryRow.goals || [],
          requirements: memoryRow.requirements || [],
          constraints: memoryRow.constraints || [],
          decisions: memoryRow.decisions || [],
          assumptions: memoryRow.assumptions || [],
          open_questions: memoryRow.open_questions || [],
          glossary: memoryRow.glossary || {},
          stakeholders: memoryRow.stakeholders || [],
        }
      }
    } catch (memErr) {
      // Working memory might not exist yet - that's OK, we'll create it
    }

    // Generate working memory from all messages
    let workingMemory: any
    try {
      workingMemory = await runnerModule.generateWorkingMemory(messages, existingMemory, key, model)
    } catch (genErr) {
      json(res, 500, {
        success: false,
        error: `Failed to generate working memory: ${genErr instanceof Error ? genErr.message : String(genErr)}`,
      } satisfies RefreshMemoryResponse)
      return
    }

    // Save to database
    const now = new Date().toISOString()
    const { error: saveError } = await supabase.from('hal_pm_working_memory').upsert(
      {
        project_id: projectId,
        agent: 'project-manager',
        summary: workingMemory.summary || '',
        goals: workingMemory.goals || [],
        requirements: workingMemory.requirements || [],
        constraints: workingMemory.constraints || [],
        decisions: workingMemory.decisions || [],
        assumptions: workingMemory.assumptions || [],
        open_questions: workingMemory.open_questions || [],
        glossary: workingMemory.glossary || {},
        stakeholders: workingMemory.stakeholders || [],
        through_sequence: messages.length,
        updated_at: now,
      },
      { onConflict: 'project_id,agent' }
    )

    if (saveError) {
      json(res, 500, {
        success: false,
        error: `Failed to save working memory: ${saveError.message}`,
      } satisfies RefreshMemoryResponse)
      return
    }

    json(res, 200, {
      success: true,
      workingMemory: {
        summary: workingMemory.summary || '',
        goals: workingMemory.goals || [],
        requirements: workingMemory.requirements || [],
        constraints: workingMemory.constraints || [],
        decisions: workingMemory.decisions || [],
        assumptions: workingMemory.assumptions || [],
        open_questions: workingMemory.open_questions || [],
        glossary: workingMemory.glossary || {},
        stakeholders: workingMemory.stakeholders || [],
        updated_at: now,
      },
    } satisfies RefreshMemoryResponse)
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    } satisfies RefreshMemoryResponse)
  }
}
