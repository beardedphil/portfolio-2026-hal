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
      supabaseUrl?: string
      supabaseAnonKey?: string
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
        status: 'error',
        reason: 'Supabase credentials not configured',
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Check if artifact_chunks table exists and has data
    // If we can query the table, pgvector is likely enabled (migration ran)
    let tableExists = false
    let pgvectorEnabled = false
    let hasEmbeddings = false
    let chunkCount = 0

    try {
      // Try to query the table - if this succeeds, table exists
      const { error: tableError } = await supabase
        .from('artifact_chunks')
        .select('chunk_id')
        .limit(1)

      if (!tableError) {
        tableExists = true
        // If we can query the embedding column without error, pgvector is enabled
        const { error: embeddingError } = await supabase
          .from('artifact_chunks')
          .select('embedding')
          .limit(1)
        
        if (!embeddingError) {
          pgvectorEnabled = true
        }

        // Count chunks with embeddings
        const { count, error: countError } = await supabase
          .from('artifact_chunks')
          .select('*', { count: 'exact', head: true })
          .not('embedding', 'is', null)

        if (!countError && count !== null) {
          chunkCount = count
          hasEmbeddings = chunkCount > 0
        }
      }
    } catch (err) {
      // Table doesn't exist or query failed
      tableExists = false
      pgvectorEnabled = false
    }

    // Determine status
    let status: 'enabled' | 'disabled' | 'error' = 'disabled'
    let reason = ''

    if (!pgvectorEnabled) {
      status = 'disabled'
      reason = 'pgvector extension is not enabled. Run migration to enable it.'
    } else if (!tableExists) {
      status = 'disabled'
      reason = 'artifact_chunks table does not exist. Run migration to create it.'
    } else if (!hasEmbeddings) {
      status = 'disabled'
      reason = 'No embeddings found. Artifacts need to be processed to generate embeddings.'
    } else {
      status = 'enabled'
      reason = `Vector search is enabled. ${chunkCount} chunks with embeddings found.`
    }

    json(res, 200, {
      success: true,
      status,
      reason,
      pgvectorEnabled,
      tableExists,
      hasEmbeddings,
      chunkCount,
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      status: 'error',
      reason: err instanceof Error ? err.message : 'Unknown error',
    })
  }
}
