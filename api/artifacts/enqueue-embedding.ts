/**
 * API endpoint to enqueue an embedding job for an artifact.
 * Called automatically when artifacts are created/updated.
 */

import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { readJsonBody, json, setCorsHeaders, handleOptionsRequest } from './_http-utils.js'
import { getSupabaseCredentials, createSupabaseClient } from './_request-handling.js'

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
      artifactId?: string
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const artifactId = typeof body.artifactId === 'string' ? body.artifactId.trim() : undefined

    if (!artifactId) {
      json(res, 400, {
        success: false,
        error: 'artifactId is required',
      })
      return
    }

    // Get Supabase credentials
    const credentials = getSupabaseCredentials(body)
    if (!credentials) {
      json(res, 400, {
        success: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
      })
      return
    }

    const supabase = createSupabaseClient(credentials.url, credentials.anonKey)

    // Check if artifact exists
    const { data: artifact, error: artifactError } = await supabase
      .from('agent_artifacts')
      .select('artifact_id, title, body_md')
      .eq('artifact_id', artifactId)
      .maybeSingle()

    if (artifactError || !artifact) {
      json(res, 404, {
        success: false,
        error: `Artifact ${artifactId} not found`,
      })
      return
    }

    // Check if there's already a queued or processing job for this artifact
    const { data: existingJob } = await supabase
      .from('embedding_jobs')
      .select('job_id, status')
      .eq('artifact_id', artifactId)
      .in('status', ['queued', 'processing'])
      .maybeSingle()

    if (existingJob) {
      json(res, 200, {
        success: true,
        job_id: existingJob.job_id,
        status: existingJob.status,
        message: 'Job already exists in queue',
      })
      return
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
      json(res, 500, {
        success: false,
        error: `Failed to create embedding job: ${jobError?.message || 'Unknown error'}`,
      })
      return
    }

    json(res, 200, {
      success: true,
      job_id: job.job_id,
      status: job.status,
      created_at: job.created_at,
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
