/**
 * API endpoint to enqueue embedding jobs for an artifact.
 * Extracts distilled knowledge atoms and creates jobs for each unique chunk.
 */

import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { extractDistilledAtomChunks, computeChunkHash } from './_embedding-utils.js'

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
      artifactId?: string
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const artifactId = typeof body.artifactId === 'string' ? body.artifactId.trim() : undefined

    if (!artifactId) {
      json(res, 400, {
        success: false,
        error: 'artifactId is required',
        jobsCreated: 0,
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
        jobsCreated: 0,
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Fetch the artifact
    const { data: artifact, error: artifactError } = await supabase
      .from('agent_artifacts')
      .select('artifact_id, title, body_md')
      .eq('artifact_id', artifactId)
      .maybeSingle()

    if (artifactError || !artifact) {
      json(res, 404, {
        success: false,
        error: artifactError?.message || `Artifact ${artifactId} not found`,
        jobsCreated: 0,
      })
      return
    }

    if (!artifact.body_md || !artifact.body_md.trim()) {
      json(res, 400, {
        success: false,
        error: 'Artifact has no body_md content to distill',
        jobsCreated: 0,
      })
      return
    }

    // Extract distilled knowledge atoms
    const extractResult = await extractDistilledAtomChunks(artifact.body_md, artifact.title || undefined)

    if (!extractResult.success || !extractResult.chunks || extractResult.chunks.length === 0) {
      json(res, 200, {
        success: true,
        message: extractResult.error || 'No distilled atoms found to embed',
        jobsCreated: 0,
      })
      return
    }

    // Check which chunks already have embeddings (by hash) to avoid duplicate work
    const chunkHashes = extractResult.chunks.map((chunk) => chunk.chunkHash)
    const { data: existingChunks, error: existingError } = await supabase
      .from('artifact_chunks')
      .select('chunk_hash')
      .eq('artifact_id', artifactId)
      .in('chunk_hash', chunkHashes)

    if (existingError) {
      console.warn(`[enqueue-embedding] Error checking existing chunks: ${existingError.message}`)
    }

    const existingHashes = new Set((existingChunks || []).map((c: any) => c.chunk_hash).filter(Boolean))

    // Filter out chunks that already have embeddings
    const newChunks = extractResult.chunks.filter((chunk) => !existingHashes.has(chunk.chunkHash))

    if (newChunks.length === 0) {
      json(res, 200, {
        success: true,
        message: 'All chunks already have embeddings',
        jobsCreated: 0,
        skipped: extractResult.chunks.length,
      })
      return
    }

    // Check for existing jobs with the same hashes (to avoid duplicate jobs)
    const { data: existingJobs, error: jobsError } = await supabase
      .from('embedding_jobs')
      .select('chunk_hash')
      .eq('artifact_id', artifactId)
      .in('chunk_hash', newChunks.map((c) => c.chunkHash))
      .in('status', ['queued', 'processing'])

    if (jobsError) {
      console.warn(`[enqueue-embedding] Error checking existing jobs: ${jobsError.message}`)
    }

    const existingJobHashes = new Set((existingJobs || []).map((j: any) => j.chunk_hash).filter(Boolean))

    // Filter out chunks that already have queued/processing jobs
    const chunksToEnqueue = newChunks.filter((chunk) => !existingJobHashes.has(chunk.chunkHash))

    if (chunksToEnqueue.length === 0) {
      json(res, 200, {
        success: true,
        message: 'All chunks already have queued or processing jobs',
        jobsCreated: 0,
        skipped: extractResult.chunks.length,
      })
      return
    }

    // Create embedding jobs for new chunks
    const jobsToInsert = chunksToEnqueue.map((chunk) => ({
      artifact_id: artifactId,
      status: 'queued' as const,
      chunk_hash: chunk.chunkHash,
      chunk_text: chunk.text,
      chunk_index: chunk.chunkIndex,
      atom_type: chunk.atomType,
    }))

    const { data: insertedJobs, error: insertError } = await supabase
      .from('embedding_jobs')
      .insert(jobsToInsert)
      .select('job_id')

    if (insertError) {
      json(res, 500, {
        success: false,
        error: `Failed to create embedding jobs: ${insertError.message}`,
        jobsCreated: 0,
      })
      return
    }

    json(res, 200, {
      success: true,
      jobsCreated: insertedJobs?.length || 0,
      skipped: extractResult.chunks.length - chunksToEnqueue.length,
      totalChunks: extractResult.chunks.length,
    })
  } catch (err) {
    console.error('[enqueue-embedding] Error:', err)
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      jobsCreated: 0,
    })
  }
}
