/**
 * Worker endpoint to process embedding jobs.
 * Picks up queued jobs, generates embeddings, and stores them in artifact_chunks.
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
      jobId?: string
      limit?: number
      supabaseUrl?: string
      supabaseAnonKey?: string
      openaiApiKey?: string
    }

    const jobId = typeof body.jobId === 'string' ? body.jobId.trim() : undefined
    const limit = typeof body.limit === 'number' && body.limit > 0 ? Math.min(body.limit, 10) : 1

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
        processed: 0,
      })
      return
    }

    if (!openaiApiKey) {
      json(res, 400, {
        success: false,
        error: 'OpenAI API key required (provide in request body or set OPENAI_API_KEY in server environment).',
        processed: 0,
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Fetch jobs to process
    let jobsQuery = supabase
      .from('embedding_jobs')
      .select('job_id, artifact_id, chunk_hash, chunk_text, chunk_index, atom_type')
      .eq('status', 'queued')
      .order('created_at', { ascending: true })
      .limit(limit)

    // If specific job ID provided, process only that job
    if (jobId) {
      jobsQuery = supabase
        .from('embedding_jobs')
        .select('job_id, artifact_id, chunk_hash, chunk_text, chunk_index, atom_type')
        .eq('job_id', jobId)
        .eq('status', 'queued')
        .limit(1)
    }

    const { data: jobs, error: jobsError } = await jobsQuery

    if (jobsError) {
      json(res, 500, {
        success: false,
        error: `Failed to fetch jobs: ${jobsError.message}`,
        processed: 0,
      })
      return
    }

    if (!jobs || jobs.length === 0) {
      json(res, 200, {
        success: true,
        message: 'No queued jobs found',
        processed: 0,
      })
      return
    }

    // Process each job
    let processed = 0
    let errors: string[] = []

    for (const job of jobs) {
      const jobId = job.job_id
      const artifactId = job.artifact_id
      const chunkHash = job.chunk_hash
      const chunkText = job.chunk_text
      const chunkIndex = job.chunk_index
      const atomType = job.atom_type

      try {
        // Mark job as processing
        const { error: updateError } = await supabase
          .from('embedding_jobs')
          .update({
            status: 'processing',
            started_at: new Date().toISOString(),
          })
          .eq('job_id', jobId)

        if (updateError) {
          errors.push(`Failed to mark job ${jobId} as processing: ${updateError.message}`)
          continue
        }

        // Check if chunk already exists (race condition check)
        const { data: existingChunk } = await supabase
          .from('artifact_chunks')
          .select('chunk_id')
          .eq('artifact_id', artifactId)
          .eq('chunk_hash', chunkHash)
          .maybeSingle()

        if (existingChunk) {
          // Chunk already embedded, mark job as succeeded
          await supabase
            .from('embedding_jobs')
            .update({
              status: 'succeeded',
              completed_at: new Date().toISOString(),
            })
            .eq('job_id', jobId)
          processed++
          continue
        }

        // Generate embedding
        let embedding: number[]
        try {
          embedding = await generateEmbedding(chunkText, openaiApiKey)
        } catch (embeddingError) {
          const errorMessage =
            embeddingError instanceof Error ? embeddingError.message : String(embeddingError)
          
          // Mark job as failed
          await supabase
            .from('embedding_jobs')
            .update({
              status: 'failed',
              error_message: errorMessage,
              completed_at: new Date().toISOString(),
            })
            .eq('job_id', jobId)

          errors.push(`Failed to generate embedding for job ${jobId}: ${errorMessage}`)
          continue
        }

        // Insert chunk with embedding
        const { error: insertError } = await supabase.from('artifact_chunks').insert({
          artifact_id: artifactId,
          chunk_text: chunkText,
          embedding: embedding,
          chunk_index: chunkIndex || 0,
          chunk_hash: chunkHash,
        })

        if (insertError) {
          // Check if it's a duplicate key error (race condition)
          if (insertError.message.includes('duplicate') || insertError.message.includes('23505')) {
            // Chunk was inserted by another worker, mark job as succeeded
            await supabase
              .from('embedding_jobs')
              .update({
                status: 'succeeded',
                completed_at: new Date().toISOString(),
              })
              .eq('job_id', jobId)
            processed++
            continue
          }

          // Mark job as failed
          await supabase
            .from('embedding_jobs')
            .update({
              status: 'failed',
              error_message: insertError.message,
              completed_at: new Date().toISOString(),
            })
            .eq('job_id', jobId)

          errors.push(`Failed to insert chunk for job ${jobId}: ${insertError.message}`)
          continue
        }

        // Mark job as succeeded
        await supabase
          .from('embedding_jobs')
          .update({
            status: 'succeeded',
            completed_at: new Date().toISOString(),
          })
          .eq('job_id', jobId)

        processed++
      } catch (jobError) {
        // Mark job as failed
        await supabase
          .from('embedding_jobs')
          .update({
            status: 'failed',
            error_message: jobError instanceof Error ? jobError.message : String(jobError),
            completed_at: new Date().toISOString(),
          })
          .eq('job_id', jobId)

        errors.push(
          `Failed to process job ${jobId}: ${jobError instanceof Error ? jobError.message : String(jobError)}`
        )
      }
    }

    json(res, 200, {
      success: true,
      processed,
      total: jobs.length,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err) {
    console.error('[process-embedding-job] Error:', err)
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      processed: 0,
    })
  }
}
