/**
 * API endpoint to enqueue embedding jobs for distilled knowledge atoms.
 * Called automatically when artifacts are created/updated.
 * Only enqueues chunks that don't already exist (by chunk_hash).
 */

import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { distillArtifact } from '../context-bundles/_distill.js'
import { extractKnowledgeAtoms, computeChunkHash } from './_embedding-utils.js'
import {
  readJsonBody,
  json,
  setCorsHeaders,
  handleOptionsRequest,
} from './_http-utils.js'

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
    const body = (await readJsonBody(req, 'enqueue-embeddings')) as {
      artifactId: string
      supabaseUrl?: string
      supabaseAnonKey?: string
      openaiApiKey?: string
    }

    const artifactId = typeof body.artifactId === 'string' ? body.artifactId.trim() : undefined

    if (!artifactId) {
      json(res, 400, {
        success: false,
        error: 'artifactId is required.',
      })
      return
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
        error: 'OpenAI API key required for distillation.',
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Fetch artifact
    const { data: artifact, error: artifactError } = await supabase
      .from('agent_artifacts')
      .select('artifact_id, title, body_md')
      .eq('artifact_id', artifactId)
      .maybeSingle()

    if (artifactError || !artifact) {
      json(res, 404, {
        success: false,
        error: `Artifact ${artifactId} not found.`,
      })
      return
    }

    if (!artifact.body_md || !artifact.body_md.trim()) {
      json(res, 400, {
        success: false,
        error: 'Artifact has no body_md to distill.',
      })
      return
    }

    // Distill artifact to extract knowledge atoms
    const distillationResult = await distillArtifact(artifact.body_md, artifact.title)

    if (!distillationResult.success || !distillationResult.distilled) {
      json(res, 500, {
        success: false,
        error: `Distillation failed: ${distillationResult.error || 'Unknown error'}`,
      })
      return
    }

    // Extract knowledge atoms (summary, hard_facts, keywords)
    const knowledgeAtoms = extractKnowledgeAtoms(distillationResult.distilled)

    if (knowledgeAtoms.length === 0) {
      json(res, 200, {
        success: true,
        message: 'No knowledge atoms extracted from artifact.',
        enqueued: 0,
        skipped: 0,
      })
      return
    }

    // Compute chunk hashes and check which ones already exist
    const chunksToEnqueue: Array<{ text: string; hash: string; index: number }> = []
    const existingHashes = new Set<string>()

    // Get existing chunk hashes for this artifact
    const { data: existingChunks } = await supabase
      .from('artifact_chunks')
      .select('chunk_hash')
      .eq('artifact_id', artifactId)
      .not('chunk_hash', 'is', null)

    if (existingChunks) {
      for (const chunk of existingChunks) {
        if (chunk.chunk_hash) {
          existingHashes.add(chunk.chunk_hash)
        }
      }
    }

    // Also check for existing jobs (queued or processing) to avoid duplicates
    const { data: existingJobs } = await supabase
      .from('embedding_jobs')
      .select('chunk_hash')
      .eq('artifact_id', artifactId)
      .in('status', ['queued', 'processing'])

    if (existingJobs) {
      for (const job of existingJobs) {
        if (job.chunk_hash) {
          existingHashes.add(job.chunk_hash)
        }
      }
    }

    // Prepare chunks to enqueue (only new ones)
    for (let i = 0; i < knowledgeAtoms.length; i++) {
      const atom = knowledgeAtoms[i]
      const hash = computeChunkHash(atom)

      // Skip if this hash already exists (either as a chunk or as a queued job)
      if (!existingHashes.has(hash)) {
        chunksToEnqueue.push({
          text: atom,
          hash,
          index: i,
        })
      }
    }

    // Enqueue new chunks
    let enqueued = 0
    const errors: string[] = []

    if (chunksToEnqueue.length > 0) {
      const jobsToInsert = chunksToEnqueue.map((chunk) => ({
        artifact_id: artifactId,
        chunk_text: chunk.text,
        chunk_hash: chunk.hash,
        chunk_index: chunk.index,
        status: 'queued' as const,
      }))

      const { error: insertError } = await supabase.from('embedding_jobs').insert(jobsToInsert)

      if (insertError) {
        // Handle unique constraint violation (race condition)
        if (insertError.code === '23505') {
          // Some jobs may have been inserted by another process, try individual inserts
          for (const chunk of chunksToEnqueue) {
            const { error: singleInsertError } = await supabase
              .from('embedding_jobs')
              .insert({
                artifact_id: artifactId,
                chunk_text: chunk.text,
                chunk_hash: chunk.hash,
                chunk_index: chunk.index,
                status: 'queued',
              })
              .select()

            if (!singleInsertError) {
              enqueued++
            } else if (singleInsertError.code !== '23505') {
              // Not a duplicate error, log it
              errors.push(`Failed to enqueue chunk ${chunk.index}: ${singleInsertError.message}`)
            }
            // If it's a duplicate (23505), skip silently
          }
        } else {
          errors.push(`Failed to enqueue jobs: ${insertError.message}`)
        }
      } else {
        enqueued = chunksToEnqueue.length
      }
    }

    const skipped = knowledgeAtoms.length - enqueued

    json(res, 200, {
      success: true,
      enqueued,
      skipped,
      total: knowledgeAtoms.length,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err) {
    console.error('[enqueue-embeddings] Error:', err)
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
