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
    const body = (await readJsonBody(req)) as {
      projectId?: string
      agent?: string
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

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

    if (!projectId || !agent) {
      json(res, 400, {
        success: false,
        error: 'projectId and agent are required.',
      })
      return
    }

    if (!supabaseUrl || !supabaseAnonKey) {
      json(res, 400, {
        success: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    const { data, error } = await supabase
      .from('hal_conversation_working_memory')
      .select('*')
      .eq('project_id', projectId)
      .eq('agent', agent)
      .maybeSingle()

    if (error) {
      json(res, 200, {
        success: false,
        error: `Failed to fetch working memory: ${error.message}`,
      })
      return
    }

    if (!data) {
      // Return empty working memory structure if none exists
      json(res, 200, {
        success: true,
        workingMemory: {
          summary: '',
          goals: [],
          requirements: [],
          constraints: [],
          decisions: [],
          assumptions: [],
          openQuestions: [],
          glossary: {},
          stakeholders: [],
          lastUpdatedAt: null,
          throughSequence: 0,
        },
      })
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
        openQuestions: data.open_questions || [],
        glossary: data.glossary || {},
        stakeholders: data.stakeholders || [],
        lastUpdatedAt: data.last_updated_at || null,
        throughSequence: data.through_sequence || 0,
      },
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}