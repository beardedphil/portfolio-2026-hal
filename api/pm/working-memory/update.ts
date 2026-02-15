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

type WorkingMemoryUpdate = {
  project_id: string
  conversation_id?: string
  summary?: string | null
  goals?: string[]
  requirements?: string[]
  constraints?: string[]
  decisions?: string[]
  assumptions?: string[]
  open_questions?: string[]
  glossary?: Record<string, string> | null
  stakeholders?: string[]
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') {
    res.statusCode = 405
    res.end('Method Not Allowed')
    return
  }

  try {
    const body = (await readJsonBody(req)) as {
      update: WorkingMemoryUpdate
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const update = body.update
    if (!update.project_id) {
      json(res, 400, { success: false, error: 'project_id is required in update' })
      return
    }

    const supabaseUrl = typeof body.supabaseUrl === 'string' ? body.supabaseUrl.trim() || undefined : undefined
    const supabaseAnonKey = typeof body.supabaseAnonKey === 'string' ? body.supabaseAnonKey.trim() || undefined : undefined

    if (!supabaseUrl || !supabaseAnonKey) {
      json(res, 400, { success: false, error: 'supabaseUrl and supabaseAnonKey are required' })
      return
    }

    const conversationId = update.conversation_id || 'project-manager-1'

    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Prepare update payload (only include fields that are provided)
    const updatePayload: Partial<WorkingMemoryUpdate> & { last_updated: string } = {
      last_updated: new Date().toISOString(),
    }

    if (update.summary !== undefined) updatePayload.summary = update.summary
    if (update.goals !== undefined) updatePayload.goals = update.goals
    if (update.requirements !== undefined) updatePayload.requirements = update.requirements
    if (update.constraints !== undefined) updatePayload.constraints = update.constraints
    if (update.decisions !== undefined) updatePayload.decisions = update.decisions
    if (update.assumptions !== undefined) updatePayload.assumptions = update.assumptions
    if (update.open_questions !== undefined) updatePayload.open_questions = update.open_questions
    if (update.glossary !== undefined) updatePayload.glossary = update.glossary
    if (update.stakeholders !== undefined) updatePayload.stakeholders = update.stakeholders

    const { data, error } = await supabase
      .from('hal_pm_working_memory')
      .upsert(
        {
          project_id: update.project_id,
          conversation_id: conversationId,
          ...updatePayload,
        },
        { onConflict: 'project_id,conversation_id' }
      )
      .select()
      .single()

    if (error) {
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
