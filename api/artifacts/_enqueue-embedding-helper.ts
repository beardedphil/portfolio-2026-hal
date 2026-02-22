/**
 * Helper function to enqueue an embedding job for an artifact.
 * Called automatically after artifact storage (insert/update).
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Enqueues an embedding job for an artifact.
 * Returns the job_id if successful, or null if there was an error.
 * Errors are logged but don't fail the artifact storage operation.
 */
export async function enqueueEmbeddingJob(
  supabase: SupabaseClient,
  artifactId: string
): Promise<{ success: boolean; job_id?: string; error?: string }> {
  try {
    // Check if there's already a queued or processing job for this artifact
    const { data: existingJob } = await supabase
      .from('embedding_jobs')
      .select('job_id, status')
      .eq('artifact_id', artifactId)
      .in('status', ['queued', 'processing'])
      .maybeSingle()

    if (existingJob) {
      // Job already exists, return it
      return {
        success: true,
        job_id: existingJob.job_id,
      }
    }

    // Create a new embedding job
    const { data: job, error: jobError } = await supabase
      .from('embedding_jobs')
      .insert({
        artifact_id: artifactId,
        status: 'queued',
      })
      .select('job_id, status, created_at')
      .single()

    if (jobError || !job) {
      console.error(`[enqueue-embedding] Failed to create embedding job for artifact ${artifactId}:`, jobError)
      return {
        success: false,
        error: jobError?.message || 'Failed to create embedding job',
      }
    }

    console.log(`[enqueue-embedding] Created embedding job ${job.job_id} for artifact ${artifactId}`)
    return {
      success: true,
      job_id: job.job_id,
    }
  } catch (err) {
    console.error(`[enqueue-embedding] Error enqueueing embedding job for artifact ${artifactId}:`, err)
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
