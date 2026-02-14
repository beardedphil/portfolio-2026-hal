/**
 * API endpoint to get a specific instruction topic by ID
 * POST /api/instructions/get-topic
 * Body: { topicId: string, repoFullName?: string }
 * 
 * Returns the full instruction content for a specific topic (used by get_instruction_set tool)
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
      agentType?: string
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const topicId = typeof body.topicId === 'string' ? body.topicId.trim() : undefined
    const repoFullName = typeof body.repoFullName === 'string' ? body.repoFullName.trim() : 'beardedphil/portfolio-2026-hal'

    if (!topicId) {
      json(res, 400, {
        success: false,
        error: 'topicId is required',
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

    // Get the instruction
    const { data, error } = await supabase
      .from('agent_instructions')
      .select('*')
      .eq('repo_full_name', repoFullName)
      .eq('topic_id', topicId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        // Not found
        json(res, 200, {
          success: false,
          error: `Topic "${topicId}" not found for repo "${repoFullName}"`,
        })
        return
      }
      json(res, 200, {
        success: false,
        error: `Failed to fetch instruction: ${error.message}`,
      })
      return
    }

    if (!data) {
      json(res, 200, {
        success: false,
        error: `Topic "${topicId}" not found`,
      })
      return
    }

    const topicMeta = data.topic_metadata || {}
    const instructionAgentTypes = data.agent_types || []
    
    // Check if requesting agent type has access (if agentType is provided)
    const requestingAgentType = typeof body.agentType === 'string' ? body.agentType.trim() : undefined
    let hasAccess = true
    let accessReason = 'no-agent-type-specified'
    
    if (requestingAgentType) {
      // Check if instruction applies to this agent type
      hasAccess = 
        data.always_apply ||
        instructionAgentTypes.includes('all') ||
        instructionAgentTypes.includes(requestingAgentType)
      
      accessReason = hasAccess 
        ? (data.always_apply ? 'always-apply' : instructionAgentTypes.includes('all') ? 'shared-global' : 'agent-type-match')
        : 'out-of-scope'
    }

    // Build response with access metadata
    const response: any = {
      success: true,
      topicId: data.topic_id,
      title: topicMeta.title || data.title || data.topic_id,
      description: topicMeta.description || data.description || 'No description',
      content: data.content_md || data.content_body || '',
      contentMd: data.content_md,
      contentBody: data.content_body,
      alwaysApply: data.always_apply,
      agentTypes: instructionAgentTypes,
      isBasic: data.is_basic,
      isSituational: data.is_situational,
      topicMetadata: data.topic_metadata,
      accessMetadata: {
        requestingAgentType: requestingAgentType || null,
        hasAccess,
        accessReason,
        instructionAgentTypes,
        accessedAt: new Date().toISOString(),
      },
    }

    json(res, 200, response)
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
