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

/**
 * Split text into chunks of approximately maxChunkSize characters
 * Tries to split on sentence boundaries when possible
 */
function chunkText(text: string, maxChunkSize: number = 1000): string[] {
  if (text.length <= maxChunkSize) {
    return [text]
  }

  const chunks: string[] = []
  let currentChunk = ''

  // Split by sentences first (period, exclamation, question mark followed by space)
  const sentences = text.split(/([.!?]\s+)/)

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i]
    if (currentChunk.length + sentence.length <= maxChunkSize) {
      currentChunk += sentence
    } else {
      if (currentChunk) {
        chunks.push(currentChunk.trim())
      }
      // If a single sentence is too long, split it by words
      if (sentence.length > maxChunkSize) {
        const words = sentence.split(/\s+/)
        let wordChunk = ''
        for (const word of words) {
          if (wordChunk.length + word.length + 1 <= maxChunkSize) {
            wordChunk += (wordChunk ? ' ' : '') + word
          } else {
            if (wordChunk) {
              chunks.push(wordChunk.trim())
            }
            wordChunk = word
          }
        }
        if (wordChunk) {
          currentChunk = wordChunk
        } else {
          currentChunk = ''
        }
      } else {
        currentChunk = sentence
      }
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk.trim())
  }

  return chunks.filter((chunk) => chunk.length > 0)
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
      artifactId?: string
      limit?: number
      supabaseUrl?: string
      supabaseAnonKey?: string
      openaiApiKey?: string
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
    const openaiApiKey =
      (typeof body.openaiApiKey === 'string' ? body.openaiApiKey.trim() : undefined) ||
      process.env.OPENAI_API_KEY?.trim() ||
      undefined

    if (!supabaseUrl || !supabaseAnonKey) {
      json(res, 400, {
        success: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
      })
      return
    }

    if (!openaiApiKey) {
      json(res, 400, {
        success: false,
        error: 'OpenAI API key required (provide in request body or set OPENAI_API_KEY in server environment).',
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Fetch artifacts that don't have embeddings yet
    let query = supabase
      .from('agent_artifacts')
      .select('artifact_id, title, body_md')
      .not('body_md', 'is', null)
      .neq('body_md', '')

    // If specific artifact ID provided, only process that one
    if (typeof body.artifactId === 'string' && body.artifactId.trim()) {
      query = query.eq('artifact_id', body.artifactId.trim())
    } else {
      // Otherwise, exclude artifacts that already have chunks
      const { data: existingChunks } = await supabase
        .from('artifact_chunks')
        .select('artifact_id')
        .limit(10000) // Get all existing artifact IDs

      const existingArtifactIds = new Set((existingChunks || []).map((c: any) => c.artifact_id))

      if (existingArtifactIds.size > 0) {
        query = query.not('artifact_id', 'in', `(${Array.from(existingArtifactIds).join(',')})`)
      }
    }

    const limit = typeof body.limit === 'number' && body.limit > 0 ? Math.min(body.limit, 100) : 10
    query = query.limit(limit)

    const { data: artifacts, error: artifactsError } = await query

    if (artifactsError) {
      json(res, 500, {
        success: false,
        error: `Failed to fetch artifacts: ${artifactsError.message}`,
        processed: 0,
      })
      return
    }

    if (!artifacts || artifacts.length === 0) {
      json(res, 200, {
        success: true,
        message: 'No artifacts found to process',
        processed: 0,
      })
      return
    }

    // Process each artifact
    let processed = 0
    let errors: string[] = []

    for (const artifact of artifacts) {
      try {
        const text = `${artifact.title}\n\n${artifact.body_md || ''}`
        const chunks = chunkText(text, 1000) // 1000 char chunks

        // Generate embeddings for each chunk
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i]
          if (!chunk.trim()) continue

          try {
            const embedding = await generateEmbedding(chunk, openaiApiKey)

            // Insert chunk with embedding
            // Supabase vector type expects the array directly
            const { error: insertError } = await supabase.from('artifact_chunks').insert({
              artifact_id: artifact.artifact_id,
              chunk_text: chunk,
              embedding: embedding, // Array of numbers - Supabase handles conversion
              chunk_index: i,
            })

            if (insertError) {
              errors.push(`Failed to insert chunk ${i} for artifact ${artifact.artifact_id}: ${insertError.message}`)
            }
          } catch (embeddingError) {
            errors.push(
              `Failed to generate embedding for chunk ${i} of artifact ${artifact.artifact_id}: ${
                embeddingError instanceof Error ? embeddingError.message : String(embeddingError)
              }`
            )
          }

          // Small delay to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 100))
        }

        processed++
      } catch (artifactError) {
        errors.push(
          `Failed to process artifact ${artifact.artifact_id}: ${
            artifactError instanceof Error ? artifactError.message : String(artifactError)
          }`
        )
      }
    }

    json(res, 200, {
      success: true,
      processed,
      total: artifacts.length,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      processed: 0,
    })
  }
}
