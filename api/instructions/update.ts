/**
 * API endpoint to update agent instructions in Supabase
 * POST /api/instructions/update
 * Body: { 
 *   topicId: string, 
 *   repoFullName?: string,
 *   content_md?: string,
 *   title?: string,
 *   description?: string,
 *   always_apply?: boolean,
 *   agent_types?: string[],
 *   is_basic?: boolean,
 *   is_situational?: boolean,
 *   topic_metadata?: object,
 *   supabaseUrl?: string,
 *   supabaseAnonKey?: string
 * }
 * 
 * Updates an existing instruction in Supabase. Only provided fields will be updated.
 */

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
      topicId?: string
      repoFullName?: string
      content_md?: string
      title?: string
      description?: string
      always_apply?: boolean
      agent_types?: string[]
      is_basic?: boolean
      is_situational?: boolean
      topic_metadata?: unknown
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const topicId = typeof body.topicId === 'string' ? body.topicId.trim() : undefined
    const repoFullName = typeof body.repoFullName === 'string' ? body.repoFullName.trim() : 'beardedphil/portfolio-2026-hal'

    if (!topicId) {
      json(res, 400, {
        success: false,
        error: 'topicId is required.',
      })
      return
    }

    // Use credentials from request body if provided, otherwise fall back to server environment variables
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

    if (!supabaseUrl || !supabaseAnonKey) {
      json(res, 400, {
        success: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Check if instruction exists
    const { data: existing, error: fetchError } = await supabase
      .from('agent_instructions')
      .select('instruction_id, content_md')
      .eq('repo_full_name', repoFullName)
      .eq('topic_id', topicId)
      .maybeSingle()

    if (fetchError) {
      json(res, 200, {
        success: false,
        error: `Failed to fetch instruction: ${fetchError.message}`,
      })
      return
    }

    if (!existing) {
      json(res, 200, {
        success: false,
        error: `Instruction not found: topicId="${topicId}", repoFullName="${repoFullName}". Use /api/instructions/migrate to create new instructions.`,
      })
      return
    }

    // Build update object with only provided fields
    const updateData: {
      content_md?: string
      content_body?: string
      title?: string
      description?: string
      always_apply?: boolean
      agent_types?: string[]
      is_basic?: boolean
      is_situational?: boolean
      topic_metadata?: unknown
    } = {}

    if (typeof body.content_md === 'string') {
      updateData.content_md = body.content_md
      // Extract content_body (content without frontmatter) if content_md is provided
      const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/
      const match = body.content_md.match(frontmatterRegex)
      updateData.content_body = match ? match[2] : body.content_md
    }

    if (typeof body.title === 'string') {
      updateData.title = body.title.trim()
    }

    if (typeof body.description === 'string') {
      updateData.description = body.description.trim()
    }

    if (typeof body.always_apply === 'boolean') {
      updateData.always_apply = body.always_apply
    }

    if (Array.isArray(body.agent_types)) {
      updateData.agent_types = body.agent_types.filter((t) => typeof t === 'string')
    }

    if (typeof body.is_basic === 'boolean') {
      updateData.is_basic = body.is_basic
    }

    if (typeof body.is_situational === 'boolean') {
      updateData.is_situational = body.is_situational
    }

    if (body.topic_metadata !== undefined) {
      updateData.topic_metadata = body.topic_metadata
    }

    // Check if there's anything to update
    if (Object.keys(updateData).length === 0) {
      json(res, 200, {
        success: false,
        error: 'No fields provided to update. Provide at least one field: content_md, title, description, always_apply, agent_types, is_basic, is_situational, or topic_metadata.',
      })
      return
    }

    // Update the instruction
    const { data: updated, error: updateError } = await supabase
      .from('agent_instructions')
      .update(updateData)
      .eq('repo_full_name', repoFullName)
      .eq('topic_id', topicId)
      .select('instruction_id, topic_id, filename, title, updated_at')
      .single()

    if (updateError) {
      json(res, 200, {
        success: false,
        error: `Failed to update instruction: ${updateError.message}`,
      })
      return
    }

    json(res, 200, {
      success: true,
      instruction: updated,
      message: `Instruction "${topicId}" updated successfully.`,
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
