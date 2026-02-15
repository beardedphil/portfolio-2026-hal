import type { IncomingMessage, ServerResponse } from 'http'
import path from 'path'
import { pathToFileURL } from 'url'

type WorkingMemoryResponse = {
  success: boolean
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
    through_sequence: number
  }
  error?: string
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
  if (req.method === 'GET') {
    // GET: Fetch working memory
    try {
      const url = new URL(req.url || '', 'http://localhost')
      const projectId = url.searchParams.get('projectId')
      const supabaseUrl = url.searchParams.get('supabaseUrl')
      const supabaseAnonKey = url.searchParams.get('supabaseAnonKey')

      if (!projectId || !supabaseUrl || !supabaseAnonKey) {
        json(res, 400, {
          success: false,
          error: 'Missing required parameters: projectId, supabaseUrl, supabaseAnonKey',
        } satisfies WorkingMemoryResponse)
        return
      }

      const { createClient } = await import('@supabase/supabase-js')
      const supabase = createClient(supabaseUrl, supabaseAnonKey)

      const { data, error } = await supabase
        .from('hal_conversation_working_memory')
        .select('*')
        .eq('project_id', projectId)
        .eq('agent', 'project-manager')
        .single()

      if (error && error.code !== 'PGRST116') {
        // PGRST116 = no rows returned, which is OK (no memory yet)
        json(res, 500, {
          success: false,
          error: error.message,
        } satisfies WorkingMemoryResponse)
        return
      }

      if (!data) {
        json(res, 200, {
          success: true,
          workingMemory: {
            summary: '',
            goals: [],
            requirements: [],
            constraints: [],
            decisions: [],
            assumptions: [],
            open_questions: [],
            glossary: {},
            stakeholders: [],
            updated_at: new Date().toISOString(),
            through_sequence: 0,
          },
        } satisfies WorkingMemoryResponse)
        return
      }

      json(res, 200, {
        success: true,
        workingMemory: {
          summary: data.summary || '',
          goals: data.goals || [],
          requirements: data.requirements || [],
          constraints: data.constraints || [],
          decisions: data.decisions || [],
          assumptions: data.assumptions || [],
          open_questions: data.open_questions || [],
          glossary: data.glossary || {},
          stakeholders: data.stakeholders || [],
          updated_at: data.updated_at || new Date().toISOString(),
          through_sequence: data.through_sequence || 0,
        },
      } satisfies WorkingMemoryResponse)
    } catch (err) {
      json(res, 500, {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      } satisfies WorkingMemoryResponse)
    }
  } else if (req.method === 'POST') {
    // POST: Refresh/update working memory
    try {
      const body = (await readJsonBody(req)) as {
        projectId?: string
        supabaseUrl?: string
        supabaseAnonKey?: string
        force?: boolean
      }

      const projectId = body.projectId
      const supabaseUrl = body.supabaseUrl
      const supabaseAnonKey = body.supabaseAnonKey
      const force = body.force === true

      if (!projectId || !supabaseUrl || !supabaseAnonKey) {
        json(res, 400, {
          success: false,
          error: 'Missing required parameters: projectId, supabaseUrl, supabaseAnonKey',
        } satisfies WorkingMemoryResponse)
        return
      }

      const key = process.env.OPENAI_API_KEY?.trim()
      const model = process.env.OPENAI_MODEL?.trim()

      if (!key || !model) {
        json(res, 503, {
          success: false,
          error: 'OpenAI API is not configured. Set OPENAI_API_KEY and OPENAI_MODEL in env.',
        } satisfies WorkingMemoryResponse)
        return
      }

      const { createClient } = await import('@supabase/supabase-js')
      const supabase = createClient(supabaseUrl, supabaseAnonKey)

      // Load runner module
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
        json(res, 503, {
          success: false,
          error: 'PM agent runner not available (missing hal-agents dist)',
        } satisfies WorkingMemoryResponse)
        return
      }

      if (!runnerModule?.generateWorkingMemory) {
        json(res, 503, {
          success: false,
          error: 'Working memory generation not available',
        } satisfies WorkingMemoryResponse)
        return
      }

      // Fetch existing working memory
      const { data: existingMemoryRow } = await supabase
        .from('hal_conversation_working_memory')
        .select('*')
        .eq('project_id', projectId)
        .eq('agent', 'project-manager')
        .single()

      const existingMemory = existingMemoryRow
        ? {
            summary: existingMemoryRow.summary || '',
            goals: existingMemoryRow.goals || [],
            requirements: existingMemoryRow.requirements || [],
            constraints: existingMemoryRow.constraints || [],
            decisions: existingMemoryRow.decisions || [],
            assumptions: existingMemoryRow.assumptions || [],
            open_questions: existingMemoryRow.open_questions || [],
            glossary: existingMemoryRow.glossary || {},
            stakeholders: existingMemoryRow.stakeholders || [],
          }
        : null

      // Fetch all messages
      const { data: messageRows } = await supabase
        .from('hal_conversation_messages')
        .select('role, content, sequence')
        .eq('project_id', projectId)
        .eq('agent', 'project-manager')
        .order('sequence', { ascending: true })

      const allMessages = (messageRows ?? []).map((r: any) => ({
        role: r.role as 'user' | 'assistant',
        content: r.content ?? '',
      }))

      if (allMessages.length === 0) {
        json(res, 200, {
          success: true,
          workingMemory: {
            summary: '',
            goals: [],
            requirements: [],
            constraints: [],
            decisions: [],
            assumptions: [],
            open_questions: [],
            glossary: {},
            stakeholders: [],
            updated_at: new Date().toISOString(),
            through_sequence: 0,
          },
        } satisfies WorkingMemoryResponse)
        return
      }

      // Generate working memory
      const workingMemory = await runnerModule.generateWorkingMemory(
        allMessages,
        existingMemory,
        key,
        model
      )

      // Get latest sequence
      const { data: latestMessageRow } = await supabase
        .from('hal_conversation_messages')
        .select('sequence')
        .eq('project_id', projectId)
        .eq('agent', 'project-manager')
        .order('sequence', { ascending: false })
        .limit(1)
        .single()

      const latestSequence = latestMessageRow?.sequence ?? allMessages.length - 1

      // Save updated working memory
      const { error: upsertError } = await supabase
        .from('hal_conversation_working_memory')
        .upsert(
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
            through_sequence: latestSequence,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'project_id,agent' }
        )

      if (upsertError) {
        json(res, 500, {
          success: false,
          error: upsertError.message,
        } satisfies WorkingMemoryResponse)
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
          updated_at: new Date().toISOString(),
          through_sequence: latestSequence,
        },
      } satisfies WorkingMemoryResponse)
    } catch (err) {
      json(res, 500, {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      } satisfies WorkingMemoryResponse)
    }
  } else {
    res.statusCode = 405
    res.end('Method Not Allowed')
  }
}
