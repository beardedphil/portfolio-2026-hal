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

    const supabase = createClient(supabaseUrl, supabaseAnonKey)
    const { data, error } = await supabase
      .from('hal_pm_working_memory')
      .select('*')
      .eq('project_id', projectId)
      .eq('agent', agent)
      .maybeSingle()

    if (error) {
      // PGRST116 is "not found", which is OK (no memory yet)
      json(res, 500, {
        success: false,
        error: `Failed to fetch working memory: ${error.message}`,
      })
      return
    }

    json(res, 200, {
      success: true,
      workingMemory: data || null,
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
