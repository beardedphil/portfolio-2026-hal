/**
 * API endpoint to get embedding job status for Diagnostics UI.
 * Returns queue status, job counts, and recent job details.
 */

import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
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
    const body = (await readJsonBody(req, 'get-embedding-jobs')) as {
      limit?: number
      artifactId?: string
      supabaseUrl?: string
      supabaseAnonKey?: string
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

    if (!supabaseUrl || !supabaseAnonKey) {
      json(res, 400, {
        success: false,
        error: 'Supabase credentials required.',
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    const limit = typeof body.limit === 'number' && body.limit > 0 ? Math.min(body.limit, 100) : 50
    const artifactId = typeof body.artifactId === 'string' ? body.artifactId.trim() : undefined

    // Build query
    let query = supabase
      .from('embedding_jobs')
      .select('job_id, artifact_id, chunk_text, chunk_hash, chunk_index, status, error_message, created_at, started_at, completed_at')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (artifactId) {
      query = query.eq('artifact_id', artifactId)
    }

    const { data: jobs, error: jobsError } = await query

    if (jobsError) {
      json(res, 500, {
        success: false,
        error: `Failed to fetch jobs: ${jobsError.message}`,
        jobs: null,
        counts: null,
      })
      return
    }

    // Get counts by status
    const countsQuery = supabase
      .from('embedding_jobs')
      .select('status', { count: 'exact', head: true })

    if (artifactId) {
      countsQuery.eq('artifact_id', artifactId)
    }

    // Get counts for each status
    const statuses = ['queued', 'processing', 'succeeded', 'failed'] as const
    const counts: Record<string, number> = {}

    for (const status of statuses) {
      let countQuery = supabase
        .from('embedding_jobs')
        .select('*', { count: 'exact', head: true })
        .eq('status', status)

      if (artifactId) {
        countQuery = countQuery.eq('artifact_id', artifactId)
      }

      const { count } = await countQuery
      counts[status] = count || 0
    }

    // Get artifact titles for jobs
    const artifactIds = [...new Set((jobs || []).map((j) => j.artifact_id))]
    const artifactTitles: Record<string, string> = {}

    if (artifactIds.length > 0) {
      const { data: artifacts } = await supabase
        .from('agent_artifacts')
        .select('artifact_id, title')
        .in('artifact_id', artifactIds)

      if (artifacts) {
        for (const artifact of artifacts) {
          artifactTitles[artifact.artifact_id] = artifact.title
        }
      }
    }

    // Enrich jobs with artifact titles
    const enrichedJobs = (jobs || []).map((job) => ({
      ...job,
      artifact_title: artifactTitles[job.artifact_id] || 'Unknown',
      // Truncate chunk_text for display (show first 200 chars)
      chunk_text_preview: job.chunk_text.substring(0, 200) + (job.chunk_text.length > 200 ? '...' : ''),
    }))

    json(res, 200, {
      success: true,
      jobs: enrichedJobs,
      counts,
      total: enrichedJobs.length,
    })
  } catch (err) {
    console.error('[get-embedding-jobs] Error:', err)
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      jobs: null,
      counts: null,
    })
  }
}
