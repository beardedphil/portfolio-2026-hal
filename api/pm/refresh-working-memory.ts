import type { IncomingMessage, ServerResponse } from 'http'
import { getWorkingMemory, updateWorkingMemoryIfNeeded } from './working-memory.js'

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

    const projectId =
      typeof body.projectId === 'string' ? body.projectId.trim() || undefined : undefined
    const conversationId =
      typeof body.conversationId === 'string'
        ? body.conversationId.trim() || undefined
        : undefined
    const supabaseUrl =
      typeof body.supabaseUrl === 'string' ? body.supabaseUrl.trim() || undefined : undefined
    const supabaseAnonKey =
      typeof body.supabaseAnonKey === 'string'
        ? body.supabaseAnonKey.trim() || undefined
        : undefined

    if (!projectId || !conversationId || !supabaseUrl || !supabaseAnonKey) {
      json(res, 400, {
        success: false,
        error: 'Missing required parameters: projectId, conversationId, supabaseUrl, supabaseAnonKey',
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

    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Fetch all messages for this conversation
    // Use conversationId as the agent field (conversation IDs are stored in agent field)
    const agentFilter = conversationId || 'project-manager'
    
    const { data: rows, error: fetchError } = await supabase
      .from('hal_conversation_messages')
      .select('role, content, sequence')
      .eq('project_id', projectId)
      .eq('agent', agentFilter)
      .order('sequence', { ascending: true })

    if (fetchError) {
      json(res, 500, {
        success: false,
        error: `Failed to fetch messages: ${fetchError.message}`,
      })
      return
    }

    if (!rows || rows.length === 0) {
      json(res, 200, {
        success: true,
        message: 'No messages found for this conversation',
        workingMemory: null,
      })
      return
    }

    const messages = rows.map((r: any) => ({
      role: r.role as 'user' | 'assistant',
      content: r.content ?? '',
      sequence: r.sequence ?? 0,
    }))

    // Force update working memory
    const workingMemory = await updateWorkingMemoryIfNeeded(
      supabase,
      projectId,
      agentFilter,
      messages,
      key,
      model,
      true // Force update
    )

    if (!workingMemory) {
      json(res, 500, {
        success: false,
        error: 'Failed to generate working memory',
      })
      return
    }

    json(res, 200, {
      success: true,
      workingMemory: {
        summary: workingMemory.summary,
        goals: workingMemory.goals,
        requirements: workingMemory.requirements,
        constraints: workingMemory.constraints,
        decisions: workingMemory.decisions,
        assumptions: workingMemory.assumptions,
        open_questions: workingMemory.open_questions,
        glossary_terms: workingMemory.glossary_terms,
        last_updated: new Date().toISOString(),
        through_sequence: workingMemory.through_sequence,
      },
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
