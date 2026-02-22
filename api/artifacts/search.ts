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

/**
 * Generate embedding using OpenAI's embedding API
 */
async function generateEmbedding(text: string, apiKey: string): Promise<number[]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenAI API error: ${response.status} ${errorText}`)
  }

  const data = (await response.json()) as {
    data: Array<{ embedding: number[] }>
  }

  return data.data[0]?.embedding || []
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
      query: string
      limit?: number
      supabaseUrl?: string
      supabaseAnonKey?: string
      openaiApiKey?: string
    }

    const query = typeof body.query === 'string' ? body.query.trim() : undefined
    if (!query) {
      json(res, 400, {
        success: false,
        error: 'query is required',
        results: [],
      })
      return
    }

    const limit = typeof body.limit === 'number' && body.limit > 0 ? Math.min(body.limit, 50) : 10

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
    const openaiApiKey =
      (typeof body.openaiApiKey === 'string' ? body.openaiApiKey.trim() : undefined) ||
      process.env.OPENAI_API_KEY?.trim() ||
      undefined

    if (!supabaseUrl || !supabaseAnonKey) {
      json(res, 400, {
        success: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
        results: [],
      })
      return
    }

    if (!openaiApiKey) {
      json(res, 400, {
        success: false,
        error: 'OpenAI API key required (provide in request body or set OPENAI_API_KEY in server environment).',
        results: [],
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Generate embedding for the query
    let queryEmbedding: number[]
    try {
      queryEmbedding = await generateEmbedding(query, openaiApiKey)
    } catch (err) {
      json(res, 500, {
        success: false,
        error: `Failed to generate embedding: ${err instanceof Error ? err.message : String(err)}`,
        results: [],
      })
      return
    }

    // Perform vector similarity search using cosine distance
    // Using RPC call for better performance with pgvector
    const { data: searchResults, error: searchError } = await supabase.rpc('search_artifact_chunks', {
      query_embedding: queryEmbedding,
      match_threshold: 0.5, // Minimum similarity score (0-1)
      match_count: limit,
    })

    if (searchError) {
      // Fallback: try direct query if RPC doesn't exist
      // This is a simpler approach that works with Supabase's built-in vector support
      const { data: chunks, error: chunksError } = await supabase
        .from('artifact_chunks')
        .select('chunk_id, artifact_id, chunk_text, chunk_index, embedding')
        .not('embedding', 'is', null)
        .limit(limit * 2) // Get more to filter by similarity

      if (chunksError) {
        json(res, 500, {
          success: false,
          error: `Vector search failed: ${chunksError.message}. Make sure pgvector is enabled and artifact_chunks table exists.`,
          results: [],
        })
        return
      }

      // Calculate cosine similarity manually for each chunk
      const resultsWithSimilarity = (chunks || [])
        .map((chunk: any) => {
          const embedding = chunk.embedding as number[]
          if (!embedding || embedding.length !== queryEmbedding.length) return null

          // Cosine similarity: dot product / (||a|| * ||b||)
          let dotProduct = 0
          let normA = 0
          let normB = 0
          for (let i = 0; i < embedding.length; i++) {
            dotProduct += embedding[i] * queryEmbedding[i]
            normA += embedding[i] * embedding[i]
            normB += queryEmbedding[i] * queryEmbedding[i]
          }
          const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))

          return {
            chunk_id: chunk.chunk_id,
            artifact_id: chunk.artifact_id,
            chunk_text: chunk.chunk_text,
            chunk_index: chunk.chunk_index,
            similarity,
          }
        })
        .filter((r: any) => r !== null && r.similarity >= 0.5)
        .sort((a: any, b: any) => b.similarity - a.similarity)
        .slice(0, limit)

      // Fetch artifact details for results
      const artifactIds = [...new Set(resultsWithSimilarity.map((r: any) => r.artifact_id))]
      const { data: artifacts, error: artifactsError } = await supabase
        .from('agent_artifacts')
        .select('artifact_id, ticket_pk, title, body_md')
        .in('artifact_id', artifactIds)

      if (artifactsError) {
        json(res, 500, {
          success: false,
          error: `Failed to fetch artifacts: ${artifactsError.message}`,
          results: [],
        })
        return
      }

      const artifactMap = new Map((artifacts || []).map((a: any) => [a.artifact_id, a]))

      const results = resultsWithSimilarity.map((r: any) => {
        const artifact = artifactMap.get(r.artifact_id)
        return {
          chunk_id: r.chunk_id,
          artifact_id: r.artifact_id,
          ticket_pk: artifact?.ticket_pk || null,
          title: artifact?.title || 'Unknown',
          snippet: r.chunk_text.substring(0, 200) + (r.chunk_text.length > 200 ? '...' : ''),
          similarity: Math.round(r.similarity * 100) / 100, // Round to 2 decimal places
        }
      })

      json(res, 200, {
        success: true,
        results,
        query,
      })
      return
    }

    // If RPC worked, format results
    const artifactIds = [...new Set((searchResults || []).map((r: any) => r.artifact_id))]
    const { data: artifacts, error: artifactsError } = await supabase
      .from('agent_artifacts')
      .select('artifact_id, ticket_pk, title, body_md')
      .in('artifact_id', artifactIds)

    if (artifactsError) {
      json(res, 500, {
        success: false,
        error: `Failed to fetch artifacts: ${artifactsError.message}`,
        results: [],
      })
      return
    }

    const artifactMap = new Map((artifacts || []).map((a: any) => [a.artifact_id, a]))

    const results = (searchResults || []).map((r: any) => {
      const artifact = artifactMap.get(r.artifact_id)
      return {
        chunk_id: r.chunk_id,
        artifact_id: r.artifact_id,
        ticket_pk: artifact?.ticket_pk || null,
        title: artifact?.title || 'Unknown',
        snippet: r.chunk_text?.substring(0, 200) + (r.chunk_text?.length > 200 ? '...' : '') || '',
        similarity: typeof r.similarity === 'number' ? Math.round(r.similarity * 100) / 100 : 0,
      }
    })

    json(res, 200, {
      success: true,
      results,
      query,
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      results: [],
    })
  }
}
