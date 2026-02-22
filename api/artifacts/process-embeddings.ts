/**
 * Worker endpoint to process embedding jobs from the queue.
 * Fetches queued jobs, generates embeddings, and stores them in artifact_chunks.
 * Should be called periodically (e.g., via cron or scheduled function).
 */

import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import {
  readJsonBody,
  json,
  setCorsHeaders,
  handleOptionsRequest,
} from './_http-utils.js'

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
  setCorsHeaders(res)

  if (req.method === 'OPTIONS') {
    handleOptionsRequest(res)
    return
  }

  if (req.method !== 'POST') {
    res.statusCode = 405
    res.end('Method Not Allowed')
    return
  }

  try {
    const body = (await readJsonBody(req, 'process-embeddings')) as {
      limit?: number
      supabaseUrl?: string
      supabaseAnonKey?: string
      openaiApiKey?: string
    }

    // Get credentials
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
        error: 'Supabase credentials required.',
      })
      return
    }

    if (!openaiApiKey) {
      json(res, 400, {
        success: false,
        error: 'OpenAI API key required.',
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    const limit = typeof body.limit === 'number' && body.limit > 0 ? Math.min(body.limit, 50) : 10

    // Fetch queued jobs (oldest first)
    const { data: jobs, error: jobsError } = await supabase
      .from('embedding_jobs')
      .select('job_id, artifact_id, chunk_text, chunk_hash, chunk_index')
      .eq('status', 'queued')
      .order('created_at', { ascending: true })
      .limit(limit)

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
        message: 'No queued jobs found.',
        processed: 0,
      })
      return
    }

    // Process each job
    let processed = 0
    let succeeded = 0
    let failed = 0
    const errors: string[] = []

    for (const job of jobs) {
      try {
        // Mark job as processing
        const { error: updateError } = await supabase
          .from('embedding_jobs')
          .update({
            status: 'processing',
            started_at: new Date().toISOString(),
          })
          .eq('job_id', job.job_id)

        if (updateError) {
          errors.push(`Failed to mark job ${job.job_id} as processing: ${updateError.message}`)
          failed++
          continue
        }

        // Check if chunk already exists (by hash) - another worker might have processed it
        const { data: existingChunk } = await supabase
          .from('artifact_chunks')
          .select('chunk_id, embedding')
          .eq('artifact_id', job.artifact_id)
          .eq('chunk_hash', job.chunk_hash)
          .maybeSingle()

        if (existingChunk && existingChunk.embedding) {
          // Chunk already exists with embedding, mark job as succeeded
          const { error: completeError } = await supabase
            .from('embedding_jobs')
            .update({
              status: 'succeeded',
              completed_at: new Date().toISOString(),
            })
            .eq('job_id', job.job_id)

          if (completeError) {
            errors.push(`Failed to mark job ${job.job_id} as succeeded: ${completeError.message}`)
          } else {
            succeeded++
          }
          processed++
          continue
        }

        // Generate embedding
        let embedding: number[]
        try {
          embedding = await generateEmbedding(job.chunk_text, openaiApiKey)
        } catch (embeddingError) {
          // Mark job as failed
          const errorMsg =
            embeddingError instanceof Error ? embeddingError.message : String(embeddingError)
          await supabase
            .from('embedding_jobs')
            .update({
              status: 'failed',
              error_message: errorMsg,
              completed_at: new Date().toISOString(),
            })
            .eq('job_id', job.job_id)

          errors.push(`Failed to generate embedding for job ${job.job_id}: ${errorMsg}`)
          failed++
          processed++
          continue
        }

        // Insert or update chunk with embedding
        // First try to update existing chunk, then insert if it doesn't exist
        const { data: existingChunkForUpdate, error: checkError } = await supabase
          .from('artifact_chunks')
          .select('chunk_id')
          .eq('artifact_id', job.artifact_id)
          .eq('chunk_hash', job.chunk_hash)
          .maybeSingle()

        let insertOrUpdateError = null

        if (existingChunkForUpdate) {
          // Update existing chunk
          const { error: updateError } = await supabase
            .from('artifact_chunks')
            .update({
              chunk_text: job.chunk_text,
              embedding: embedding,
              chunk_index: job.chunk_index,
            })
            .eq('chunk_id', existingChunkForUpdate.chunk_id)

          insertOrUpdateError = updateError
        } else {
          // Insert new chunk
          const { error: insertError } = await supabase.from('artifact_chunks').insert({
            artifact_id: job.artifact_id,
            chunk_text: job.chunk_text,
            chunk_hash: job.chunk_hash,
            chunk_index: job.chunk_index,
            embedding: embedding,
          })

          insertOrUpdateError = insertError
          // If it's a unique constraint violation, another worker already inserted it - that's okay
          if (insertError && insertError.code === '23505') {
            insertOrUpdateError = null // Treat as success
          }
        }

        if (insertOrUpdateError) {
          // Mark job as failed
          await supabase
            .from('embedding_jobs')
            .update({
              status: 'failed',
              error_message: insertOrUpdateError.message,
              completed_at: new Date().toISOString(),
            })
            .eq('job_id', job.job_id)

          errors.push(`Failed to insert/update chunk for job ${job.job_id}: ${insertOrUpdateError.message}`)
          failed++
        } else {
          // Mark job as succeeded
          const { error: completeError } = await supabase
            .from('embedding_jobs')
            .update({
              status: 'succeeded',
              completed_at: new Date().toISOString(),
            })
            .eq('job_id', job.job_id)

          if (completeError) {
            errors.push(`Failed to mark job ${job.job_id} as succeeded: ${completeError.message}`)
          } else {
            succeeded++
          }
        }

        processed++

        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 100))
      } catch (jobError) {
        // Mark job as failed
        const errorMsg = jobError instanceof Error ? jobError.message : String(jobError)
        await supabase
          .from('embedding_jobs')
          .update({
            status: 'failed',
            error_message: errorMsg,
            completed_at: new Date().toISOString(),
          })
          .eq('job_id', job.job_id)

        errors.push(`Failed to process job ${job.job_id}: ${errorMsg}`)
        failed++
        processed++
      }
    }

    json(res, 200, {
      success: true,
      processed,
      succeeded,
      failed,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err) {
    console.error('[process-embeddings] Error:', err)
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      processed: 0,
    })
  }
}
