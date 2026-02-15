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
    }

    const projectId = typeof body.projectId === 'string' ? body.projectId.trim() || undefined : undefined
    const conversationId = typeof body.conversationId === 'string' ? body.conversationId.trim() || 'project-manager-1' : 'project-manager-1'
    const supabaseUrl = typeof body.supabaseUrl === 'string' ? body.supabaseUrl.trim() || undefined : undefined
    const supabaseAnonKey = typeof body.supabaseAnonKey === 'string' ? body.supabaseAnonKey.trim() || undefined : undefined

    if (!projectId || !supabaseUrl || !supabaseAnonKey) {
      json(res, 400, { success: false, error: 'projectId, supabaseUrl, and supabaseAnonKey are required' })
      return
    }

    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    const { data, error } = await supabase
      .from('hal_pm_working_memory')
      .select('*')
      .eq('project_id', projectId)
      .eq('conversation_id', conversationId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        // Not found - return empty structure
        json(res, 200, {
          success: true,
          data: {
            project_id: projectId,
            conversation_id: conversationId,
            summary: null,
            goals: [],
            requirements: [],
            constraints: [],
            decisions: [],
            assumptions: [],
            open_questions: [],
            glossary: {},
            stakeholders: [],
            last_updated: null,
            created_at: null,
          },
        })
        return
      }
      json(res, 500, { success: false, error: error.message })
      return
    }

    json(res, 200, { success: true, data })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
