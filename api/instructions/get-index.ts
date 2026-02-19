/**
 * API endpoint to get the instruction index (metadata about available topics)
 * POST /api/instructions/get-index
 * Body: { repoFullName?: string, agentType?: string }
 * 
 * Returns the instruction index with available topics and their metadata, filtered by agent type if specified
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
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

function isWebRequest(v: unknown): v is Request {
  return typeof v === 'object' && v !== null && 'url' in v && typeof (v as Request).headers?.get === 'function'
}

function withCors(headers: Headers) {
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')
  headers.set('Cache-Control', 'no-store')
  return headers
}

async function handleWebRequest(request: Request): Promise<Response> {
  const headers = withCors(new Headers({ 'Content-Type': 'application/json' }))

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers })
  }

  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers })
  }

  let body: any = {}
  try {
    body = (await request.json().catch(() => ({}))) as any
  } catch {
    body = {}
  }

  const repoFullName = typeof body.repoFullName === 'string' ? body.repoFullName.trim() : 'beardedphil/portfolio-2026-hal'
  const agentType = typeof body.agentType === 'string' ? body.agentType.trim() : undefined

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
    return new Response(
      JSON.stringify({
        success: false,
        error:
          'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
      }),
      { status: 400, headers }
    )
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  const { data: indexData, error: indexError } = await supabase
    .from('agent_instruction_index')
    .select('index_data')
    .eq('repo_full_name', repoFullName)
    .single()

  if (indexError && (indexError as any).code !== 'PGRST116') {
    return new Response(JSON.stringify({ success: false, error: `Failed to fetch instruction index: ${indexError.message}` }), {
      status: 200,
      headers,
    })
  }

  if (!indexData || (indexError as any)?.code === 'PGRST116') {
    const { data: instructions, error: instError } = await supabase
      .from('agent_instructions')
      .select('topic_id, is_basic, topic_metadata, agent_types, always_apply')
      .eq('repo_full_name', repoFullName)

    if (instError) {
      return new Response(JSON.stringify({ success: false, error: `Failed to fetch instructions: ${instError.message}` }), {
        status: 200,
        headers,
      })
    }

    let filteredInstructions = instructions || []
    if (agentType) {
      filteredInstructions = filteredInstructions.filter((inst: any) => {
        const agentTypes = inst.agent_types || []
        return inst.always_apply || agentTypes.includes('all') || agentTypes.includes(agentType)
      })
    }

    const derivedIndex = {
      basic: (filteredInstructions || []).filter((inst: any) => inst.is_basic).map((inst: any) => inst.topic_id),
      situational: {} as Record<string, string[]>,
      topics: {} as Record<string, any>,
    }

    for (const inst of filteredInstructions || []) {
      if (inst.topic_metadata) {
        derivedIndex.topics[inst.topic_id] = {
          ...inst.topic_metadata,
          agentTypes: inst.agent_types || [],
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        index: derivedIndex,
        repoFullName,
        agentType: agentType || 'all',
        source: 'derived',
        metadata: {
          totalTopics: (instructions || []).length,
          filteredTopics: filteredInstructions.length,
          scopingApplied: !!agentType,
        },
      }),
      { status: 200, headers }
    )
  }

  let index = (indexData as any).index_data
  if (agentType) {
    const { data: allInstructions } = await supabase
      .from('agent_instructions')
      .select('topic_id, agent_types, always_apply')
      .eq('repo_full_name', repoFullName)

    const filteredTopicIds = new Set<string>()

    if (Array.isArray(index.basic)) {
      for (const topicId of index.basic) {
        const inst = (allInstructions || []).find((i: any) => i.topic_id === topicId)
        if (inst) {
          const agentTypes = inst.agent_types || []
          if (inst.always_apply || agentTypes.includes('all') || agentTypes.includes(agentType)) {
            filteredTopicIds.add(topicId)
          }
        }
      }
    }

    if (index.situational && typeof index.situational === 'object') {
      for (const [agentTypeKey, topicIds] of Object.entries(index.situational)) {
        if (agentTypeKey === agentType || agentTypeKey === 'all') {
          if (Array.isArray(topicIds)) {
            topicIds.forEach((id: string) => filteredTopicIds.add(id))
          }
        }
      }
    }

    const filteredTopics: Record<string, any> = {}
    if (index.topics && typeof index.topics === 'object') {
      for (const [topicId, metadata] of Object.entries(index.topics)) {
        const inst = (allInstructions || []).find((i: any) => i.topic_id === topicId)
        if (inst) {
          const agentTypes = inst.agent_types || []
          if (inst.always_apply || agentTypes.includes('all') || agentTypes.includes(agentType)) {
            filteredTopics[topicId] = metadata
          }
        }
      }
    }

    index = {
      basic: Array.from(filteredTopicIds),
      situational: index.situational || {},
      topics: filteredTopics,
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      index,
      repoFullName,
      agentType: agentType || 'all',
      source: 'stored',
      metadata: { scopingApplied: !!agentType },
    }),
    { status: 200, headers }
  )
}

export async function POST(request: Request): Promise<Response> {
  try {
    return await handleWebRequest(request)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[api/instructions/get-index] POST', msg, err)
    const headers = withCors(new Headers({ 'Content-Type': 'application/json' }))
    return new Response(JSON.stringify({ success: false, error: msg }), { status: 500, headers })
  }
}

export default async function handler(req: IncomingMessage | Request, res?: ServerResponse) {
  if (isWebRequest(req)) {
    return await handleWebRequest(req)
  }
  if (!res) throw new Error('Response object missing')
  // CORS: Allow cross-origin requests
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')

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
        .select('topic_id, is_basic, topic_metadata, agent_types, always_apply')
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

      // Derive index from instructions (filtered by agent type if specified)
      const derivedIndex = {
        basic: (filteredInstructions || [])
          .filter((inst: any) => inst.is_basic)
          .map((inst: any) => inst.topic_id),
        situational: {} as Record<string, string[]>,
        topics: {} as Record<string, any>,
      }

      for (const inst of filteredInstructions || []) {
        if (inst.topic_metadata) {
          derivedIndex.topics[inst.topic_id] = {
            ...inst.topic_metadata,
            agentTypes: inst.agent_types || [],
          }
        }
      }

      json(res, 200, {
        success: true,
        index: derivedIndex,
        repoFullName,
        agentType: agentType || 'all',
        source: 'derived',
        metadata: {
          totalTopics: (instructions || []).length,
          filteredTopics: filteredInstructions.length,
          scopingApplied: !!agentType,
        },
      })
      return
    }

    // If stored index exists, still filter by agent type if specified
    let index = indexData.index_data
    if (agentType) {
      // Get all instructions to filter
      const { data: allInstructions } = await supabase
        .from('agent_instructions')
        .select('topic_id, agent_types, always_apply')
        .eq('repo_full_name', repoFullName)

      const filteredTopicIds = new Set<string>()
      
      // Filter basic topics
      if (Array.isArray(index.basic)) {
        for (const topicId of index.basic) {
          const inst = (allInstructions || []).find((i: any) => i.topic_id === topicId)
          if (inst) {
            const agentTypes = inst.agent_types || []
            if (inst.always_apply || agentTypes.includes('all') || agentTypes.includes(agentType)) {
              filteredTopicIds.add(topicId)
            }
          }
        }
      }

      // Filter situational topics
      if (index.situational && typeof index.situational === 'object') {
        for (const [agentTypeKey, topicIds] of Object.entries(index.situational)) {
          if (agentTypeKey === agentType || agentTypeKey === 'all') {
            if (Array.isArray(topicIds)) {
              topicIds.forEach((id: string) => filteredTopicIds.add(id))
            }
          }
        }
      }

      // Filter topics metadata
      const filteredTopics: Record<string, any> = {}
      if (index.topics && typeof index.topics === 'object') {
        for (const [topicId, metadata] of Object.entries(index.topics)) {
          const inst = (allInstructions || []).find((i: any) => i.topic_id === topicId)
          if (inst) {
            const agentTypes = inst.agent_types || []
            if (inst.always_apply || agentTypes.includes('all') || agentTypes.includes(agentType)) {
              filteredTopics[topicId] = metadata
            }
          }
        }
      }

      index = {
        basic: Array.from(filteredTopicIds),
        situational: index.situational || {},
        topics: filteredTopics,
      }
    }

    json(res, 200, {
      success: true,
      index,
      repoFullName,
      agentType: agentType || 'all',
      source: 'stored',
      metadata: {
        scopingApplied: !!agentType,
      },
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
