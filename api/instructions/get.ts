/**
 * API endpoint to get agent instructions from Supabase
 * POST /api/instructions/get
 * Body: { repoFullName?: string, agentType?: string, includeBasic?: boolean, includeSituational?: boolean }
 * 
 * Returns all instructions for a repo, optionally filtered by agent type and instruction type
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
      repoFullName?: string
      agentType?: string
      includeBasic?: boolean
      includeSituational?: boolean
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const repoFullName = typeof body.repoFullName === 'string' ? body.repoFullName.trim() : 'beardedphil/portfolio-2026-hal'
    const agentType = typeof body.agentType === 'string' ? body.agentType.trim() : undefined
    const includeBasic = body.includeBasic !== false // Default to true
    const includeSituational = body.includeSituational !== false // Default to true

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

    // Build query
    let query = supabase
      .from('agent_instructions')
      .select('*')
      .eq('repo_full_name', repoFullName)
      .order('filename')

    // Filter by instruction type
    if (includeBasic && !includeSituational) {
      query = query.eq('is_basic', true)
    } else if (includeSituational && !includeBasic) {
      query = query.eq('is_situational', true)
    }
    // If both are true (default), get all

    const { data: instructions, error } = await query

    if (error) {
      json(res, 200, {
        success: false,
        error: `Failed to fetch instructions: ${error.message}`,
      })
      return
    }

    // Filter by agent type if specified
    let filteredInstructions = instructions || []
    let outOfScopeCount = 0
    
    if (agentType) {
      const beforeFilter = filteredInstructions.length
      filteredInstructions = filteredInstructions.filter((inst: any) => {
        const agentTypes = inst.agent_types || []
        return (
          inst.always_apply ||
          agentTypes.includes('all') ||
          agentTypes.includes(agentType)
        )
      })
      outOfScopeCount = beforeFilter - filteredInstructions.length
    }

    // Format response
    const formatted = (filteredInstructions || []).map((inst: any) => ({
      topicId: inst.topic_id,
      filename: inst.filename,
      title: inst.title,
      description: inst.description,
      contentMd: inst.content_md,
      contentBody: inst.content_body,
      alwaysApply: inst.always_apply,
      agentTypes: inst.agent_types || [],
      isBasic: inst.is_basic,
      isSituational: inst.is_situational,
      topicMetadata: inst.topic_metadata,
      createdAt: inst.created_at,
      updatedAt: inst.updated_at,
    }))

    json(res, 200, {
      success: true,
      instructions: formatted,
      count: formatted.length,
      repoFullName,
      agentType: agentType || 'all',
      metadata: {
        totalAvailable: (instructions || []).length,
        filteredCount: formatted.length,
        outOfScopeCount,
        scopingApplied: !!agentType,
        accessedAt: new Date().toISOString(),
      },
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
