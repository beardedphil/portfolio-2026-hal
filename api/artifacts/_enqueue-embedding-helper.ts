/**
 * Helper function to enqueue embedding jobs for an artifact.
 * Called automatically after artifact create/update.
 * Runs asynchronously and does not block artifact storage.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { extractDistilledAtomChunks } from './_embedding-utils.js'

/**
 * Enqueues embedding jobs for an artifact's distilled knowledge atoms.
 * This is called automatically after artifact storage and runs asynchronously.
 */
export async function enqueueEmbeddingJobs(
  supabase: SupabaseClient,
  artifactId: string,
  artifactBodyMd: string,
  artifactTitle?: string
): Promise<{ success: boolean; jobsCreated?: number; error?: string }> {
  try {
    // Extract distilled knowledge atoms
    const extractResult = await extractDistilledAtomChunks(artifactBodyMd, artifactTitle)

    if (!extractResult.success || !extractResult.chunks || extractResult.chunks.length === 0) {
      return {
        success: true,
        jobsCreated: 0,
      }
    }

    // Check which chunks already have embeddings (by hash) to avoid duplicate work
    const chunkHashes = extractResult.chunks.map((chunk) => chunk.chunkHash)
    const { data: existingChunks, error: existingError } = await supabase
      .from('artifact_chunks')
      .select('chunk_hash')
      .eq('artifact_id', artifactId)
      .in('chunk_hash', chunkHashes)

    if (existingError) {
      console.warn(`[_enqueue-embedding-helper] Error checking existing chunks: ${existingError.message}`)
    }

    const existingHashes = new Set((existingChunks || []).map((c: any) => c.chunk_hash).filter(Boolean))

    // Filter out chunks that already have embeddings
    const newChunks = extractResult.chunks.filter((chunk) => !existingHashes.has(chunk.chunkHash))

    if (newChunks.length === 0) {
      return {
        success: true,
        jobsCreated: 0,
      }
    }

    // Check for existing jobs with the same hashes (to avoid duplicate jobs)
    const { data: existingJobs, error: jobsError } = await supabase
      .from('embedding_jobs')
      .select('chunk_hash')
      .eq('artifact_id', artifactId)
      .in('chunk_hash', newChunks.map((c) => c.chunkHash))
      .in('status', ['queued', 'processing'])

    if (jobsError) {
      console.warn(`[_enqueue-embedding-helper] Error checking existing jobs: ${jobsError.message}`)
    }

    const existingJobHashes = new Set((existingJobs || []).map((j: any) => j.chunk_hash).filter(Boolean))

    // Filter out chunks that already have queued/processing jobs
    const chunksToEnqueue = newChunks.filter((chunk) => !existingJobHashes.has(chunk.chunkHash))

    if (chunksToEnqueue.length === 0) {
      return {
        success: true,
        jobsCreated: 0,
      }
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
      console.error(`[_enqueue-embedding-helper] Failed to create embedding jobs: ${insertError.message}`)
      return {
        success: false,
        error: insertError.message,
        jobsCreated: 0,
      }
    }

    return {
      success: true,
      jobsCreated: insertedJobs?.length || 0,
    }
  } catch (err) {
    console.error('[_enqueue-embedding-helper] Error:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      jobsCreated: 0,
    }
  }
}
