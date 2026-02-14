/**
 * API endpoint to get the instruction index (metadata about available topics)
 * POST /api/instructions/get-index
 * Body: { repoFullName?: string }
 * 
 * Returns the instruction index with available topics and their metadata
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
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const repoFullName = typeof body.repoFullName === 'string' ? body.repoFullName.trim() : 'beardedphil/portfolio-2026-hal'
    const agentType = typeof body.agentType === 'string' ? body.agentType.trim() : undefined

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

    // Get instruction index
    const { data: indexData, error: indexError } = await supabase
      .from('agent_instruction_index')
      .select('index_data')
      .eq('repo_full_name', repoFullName)
      .single()

    if (indexError && indexError.code !== 'PGRST116') {
      json(res, 200, {
        success: false,
        error: `Failed to fetch instruction index: ${indexError.message}`,
      })
      return
    }

    // If index doesn't exist, derive it from instructions
    if (!indexData || indexError?.code === 'PGRST116') {
      const { data: instructions, error: instError } = await supabase
        .from('agent_instructions')
        .select('topic_id, is_basic, is_situational, agent_types, always_apply, topic_metadata')
        .eq('repo_full_name', repoFullName)

      if (instError) {
        json(res, 200, {
          success: false,
          error: `Failed to fetch instructions: ${instError.message}`,
        })
        return
      }

      // Filter by agent type if specified
      let filteredInstructions = instructions || []
      if (agentType) {
        filteredInstructions = filteredInstructions.filter((inst: any) => {
          const agentTypes = inst.agent_types || []
          return (
            inst.always_apply ||
            agentTypes.includes('all') ||
            agentTypes.includes(agentType)
          )
        })
      }

      // Derive index from filtered instructions
      const derivedIndex = {
        basic: filteredInstructions
          .filter((inst: any) => inst.is_basic)
          .map((inst: any) => inst.topic_id),
        situational: {} as Record<string, string[]>,
        topics: {} as Record<string, any>,
      }

      for (const inst of filteredInstructions) {
        if (inst.topic_metadata) {
          derivedIndex.topics[inst.topic_id] = inst.topic_metadata
        }
      }

      json(res, 200, {
        success: true,
        index: derivedIndex,
        repoFullName,
        agentType: agentType || 'all',
        source: 'derived',
        metadata: {
          scoped: agentType ? true : false,
          totalTopics: filteredInstructions.length,
        },
      })
      return
    }

    // If stored index exists, still apply agent type filtering
    let index = indexData.index_data
    if (agentType) {
      // Need to fetch instructions to filter properly
      const { data: instructions, error: instError } = await supabase
        .from('agent_instructions')
        .select('topic_id, is_basic, is_situational, agent_types, always_apply')
        .eq('repo_full_name', repoFullName)

      if (!instError && instructions) {
        const filteredInstructions = instructions.filter((inst: any) => {
          const agentTypes = inst.agent_types || []
          return (
            inst.always_apply ||
            agentTypes.includes('all') ||
            agentTypes.includes(agentType)
          )
        })

        // Filter index based on filtered instructions
        const filteredTopicIds = new Set(filteredInstructions.map((inst: any) => inst.topic_id))
        index = {
          basic: (index.basic || []).filter((id: string) => filteredTopicIds.has(id)),
          situational: index.situational || {},
          topics: Object.fromEntries(
            Object.entries(index.topics || {}).filter(([id]) => filteredTopicIds.has(id))
          ),
        }
      }
    }

    json(res, 200, {
      success: true,
      index,
      repoFullName,
      agentType: agentType || 'all',
      source: 'stored',
      metadata: {
        scoped: agentType ? true : false,
      },
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
