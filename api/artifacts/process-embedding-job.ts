/**
 * API endpoint to process an embedding job.
 * This is the worker that:
 * 1. Distills the artifact into knowledge atoms
 * 2. Computes chunk hashes for deduplication
 * 3. Generates embeddings only for new/changed chunks
 * 4. Updates job status
 */

import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { readJsonBody, json, setCorsHeaders, handleOptionsRequest } from './_http-utils.js'
import { getSupabaseCredentials, createSupabaseClient } from './_request-handling.js'
import { extractDistilledAtoms, computeChunkHash } from './_embedding-utils.js'

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
    const body = (await readJsonBody(req)) as {
      jobId?: string
      limit?: number
      supabaseUrl?: string
      supabaseAnonKey?: string
      openaiApiKey?: string
    }

    const jobId = typeof body.jobId === 'string' ? body.jobId.trim() : undefined
    const limit = typeof body.limit === 'number' && body.limit > 0 ? Math.min(body.limit, 10) : 1

    // Get credentials
    const credentials = getSupabaseCredentials(body)
    if (!credentials) {
      json(res, 400, {
        success: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
      })
      return
    }

    const openaiApiKey =
      (typeof body.openaiApiKey === 'string' ? body.openaiApiKey.trim() : undefined) ||
      process.env.OPENAI_API_KEY?.trim() ||
      undefined

    if (!openaiApiKey) {
      json(res, 400, {
        success: false,
        error: 'OpenAI API key required (provide in request body or set OPENAI_API_KEY in server environment).',
      })
      return
    }

    const supabase = createSupabaseClient(credentials.url, credentials.anonKey)

    // Fetch queued jobs (or specific job if jobId provided)
    let query = supabase
      .from('embedding_jobs')
      .select('job_id, artifact_id, status, created_at')
      .eq('status', 'queued')
      .order('created_at', { ascending: true })
      .limit(limit)

    if (jobId) {
      query = supabase
        .from('embedding_jobs')
        .select('job_id, artifact_id, status, created_at')
        .eq('job_id', jobId)
        .maybeSingle()
    }

    const { data: jobs, error: jobsError } = await query

    if (jobsError) {
      json(res, 500, {
        success: false,
        error: `Failed to fetch jobs: ${jobsError.message}`,
        processed: 0,
      })
      return
    }

    if (!jobs || (Array.isArray(jobs) && jobs.length === 0)) {
      json(res, 200, {
        success: true,
        message: 'No queued jobs found',
        processed: 0,
      })
      return
    }

    const jobsArray = Array.isArray(jobs) ? jobs : [jobs]
    let processed = 0
    const results: Array<{
      job_id: string
      status: 'succeeded' | 'failed'
      chunks_processed: number
      chunks_skipped: number
      chunks_failed: number
      error?: string
    }> = []

    for (const job of jobsArray) {
      const jobId = job.job_id
      const artifactId = job.artifact_id

      try {
        // Mark job as processing
        await supabase
          .from('embedding_jobs')
          .update({
            status: 'processing',
            started_at: new Date().toISOString(),
          })
          .eq('job_id', jobId)

        // Fetch artifact
        const { data: artifact, error: artifactError } = await supabase
          .from('agent_artifacts')
          .select('artifact_id, title, body_md')
          .eq('artifact_id', artifactId)
          .maybeSingle()

        if (artifactError || !artifact) {
          throw new Error(`Artifact ${artifactId} not found: ${artifactError?.message || 'Unknown error'}`)
        }

        // Extract distilled knowledge atoms
        const atomsResult = await extractDistilledAtoms(artifact.body_md || '', artifact.title || undefined)

        if (!atomsResult.success || !atomsResult.atoms || atomsResult.atoms.length === 0) {
          throw new Error(`Failed to extract distilled atoms: ${atomsResult.error || 'No atoms found'}`)
        }

        const atoms = atomsResult.atoms
        let chunksProcessed = 0
        let chunksSkipped = 0
        let chunksFailed = 0

        // Process each atom chunk
        for (let i = 0; i < atoms.length; i++) {
          const atom = atoms[i]
          const chunkText = atom.text

          if (!chunkText || !chunkText.trim()) {
            chunksSkipped++
            continue
          }

          // Compute chunk hash for deduplication
          const chunkHash = computeChunkHash(chunkText)

          // Check if chunk with this hash already exists
          const { data: existingChunk } = await supabase
            .from('artifact_chunks')
            .select('chunk_id')
            .eq('chunk_hash', chunkHash)
            .maybeSingle()

          if (existingChunk) {
            // Chunk already exists, skip embedding
            chunksSkipped++
            continue
          }

          try {
            // Generate embedding
            const embedding = await generateEmbedding(chunkText, openaiApiKey)

            if (!embedding || embedding.length === 0) {
              throw new Error('Empty embedding returned from OpenAI')
            }

            // Insert chunk with embedding and hash
            const { error: insertError } = await supabase.from('artifact_chunks').insert({
              artifact_id: artifactId,
              chunk_text: chunkText,
              chunk_hash: chunkHash,
              embedding: embedding,
              chunk_index: i,
            })

            if (insertError) {
              console.error(`[process-embedding-job] Failed to insert chunk ${i} for artifact ${artifactId}:`, insertError)
              chunksFailed++
            } else {
              chunksProcessed++
            }

            // Small delay to avoid rate limiting
            await new Promise((resolve) => setTimeout(resolve, 100))
          } catch (embeddingError) {
            console.error(
              `[process-embedding-job] Failed to generate embedding for chunk ${i} of artifact ${artifactId}:`,
              embeddingError
            )
            chunksFailed++
          }
        }

        // Update job status
        const finalStatus = chunksFailed > 0 && chunksProcessed === 0 ? 'failed' : 'succeeded'
        await supabase
          .from('embedding_jobs')
          .update({
            status: finalStatus,
            completed_at: new Date().toISOString(),
            chunks_processed: chunksProcessed,
            chunks_skipped: chunksSkipped,
            chunks_failed: chunksFailed,
            error_message:
              finalStatus === 'failed' && chunksProcessed === 0
                ? `Failed to process any chunks. ${chunksFailed} failed, ${chunksSkipped} skipped.`
                : null,
          })
          .eq('job_id', jobId)

        results.push({
          job_id: jobId,
          status: finalStatus,
          chunks_processed: chunksProcessed,
          chunks_skipped: chunksSkipped,
          chunks_failed: chunksFailed,
        })

        processed++
      } catch (jobError) {
        // Mark job as failed
        await supabase
          .from('embedding_jobs')
          .update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            error_message: jobError instanceof Error ? jobError.message : String(jobError),
            error_details: {
              error: jobError instanceof Error ? jobError.message : String(jobError),
              stack: jobError instanceof Error ? jobError.stack : undefined,
            },
          })
          .eq('job_id', jobId)

        results.push({
          job_id: jobId,
          status: 'failed',
          chunks_processed: 0,
          chunks_skipped: 0,
          chunks_failed: 0,
          error: jobError instanceof Error ? jobError.message : String(jobError),
        })
      }
    }

    json(res, 200, {
      success: true,
      processed,
      total: jobsArray.length,
      results,
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      processed: 0,
    })
  }
}
