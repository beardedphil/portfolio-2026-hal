import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { extractArtifactTypeFromTitle } from './_shared.js'

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
      ticketId?: string
      ticketPk?: string
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const ticketId = typeof body.ticketId === 'string' ? body.ticketId.trim() || undefined : undefined
    const ticketPk = typeof body.ticketPk === 'string' ? body.ticketPk.trim() || undefined : undefined

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

    if (!ticketId && !ticketPk) {
      json(res, 400, {
        success: false,
        error: 'ticketPk (preferred) or ticketId is required.',
      })
      return
    }

    if (!supabaseUrl || !supabaseAnonKey) {
      json(res, 400, {
        success: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // If ticketId provided, look up ticket to get pk
    let finalTicketPk = ticketPk
    if (!finalTicketPk && ticketId) {
      const ticketNumber = parseInt(ticketId, 10)
      if (!Number.isFinite(ticketNumber)) {
        json(res, 400, {
          success: false,
          error: `Invalid ticket ID: ${ticketId}. Expected numeric ID.`,
        })
        return
      }

      const { data: ticket, error: ticketError } = await supabase
        .from('tickets')
        .select('pk')
        .or(`ticket_number.eq.${ticketNumber},id.eq.${ticketId}`)
        .maybeSingle()

      if (ticketError || !ticket?.pk) {
        json(res, 200, {
          success: false,
          error: `Ticket ${ticketId} not found in Supabase.`,
          diagnostics: null,
        })
        return
      }

      finalTicketPk = ticket.pk
    }

    if (!finalTicketPk) {
      json(res, 400, {
        success: false,
        error: 'Could not determine ticket PK.',
        diagnostics: null,
      })
      return
    }

    // Required artifact types for implementation agent
    const requiredArtifactTypes = [
      { key: 'plan', title: 'Plan' },
      { key: 'worklog', title: 'Worklog' },
      { key: 'changed-files', title: 'Changed Files' },
      { key: 'decisions', title: 'Decisions' },
      { key: 'verification', title: 'Verification' },
      { key: 'pm-review', title: 'PM Review' },
      { key: 'git-diff', title: 'Git diff' },
      { key: 'instructions-used', title: 'Instructions Used' },
    ]

    // Fetch all artifacts for this ticket
    const { data: artifacts, error: artifactsError } = await supabase
      .from('agent_artifacts')
      .select('artifact_id, ticket_pk, agent_type, title, body_md, created_at')
      .eq('ticket_pk', finalTicketPk)
      .order('created_at', { ascending: false })

    if (artifactsError) {
      json(res, 200, {
        success: false,
        error: `Failed to fetch artifacts: ${artifactsError.message}`,
        diagnostics: null,
      })
      return
    }

    // Fetch all storage attempts for this ticket
    const { data: attempts, error: attemptsError } = await supabase
      .from('artifact_storage_attempts')
      .select('attempt_id, ticket_pk, artifact_type, agent_type, endpoint, outcome, error_message, validation_reason, attempted_at')
      .eq('ticket_pk', finalTicketPk)
      .order('attempted_at', { ascending: false })

    if (attemptsError) {
      // Log but don't fail - we can still provide diagnostics without attempts
      console.warn(`[get-diagnostics] Failed to fetch storage attempts: ${attemptsError.message}`)
    }

    // Fetch embedding job statistics for artifacts in this ticket
    const artifactIds = artifactsList.map((a) => a.artifact_id)
    let embeddingJobs: {
      queued: number
      processing: number
      succeeded: number
      failed: number
      recentJobs: Array<{
        job_id: string
        artifact_id: string
        status: string
        error_message?: string
        created_at: string
        completed_at?: string
      }>
    } = {
      queued: 0,
      processing: 0,
      succeeded: 0,
      failed: 0,
      recentJobs: [],
    }

    if (artifactIds.length > 0) {
      // Get job counts by status
      const { data: jobCounts, error: jobCountsError } = await supabase
        .from('embedding_jobs')
        .select('status')
        .in('artifact_id', artifactIds)

      if (!jobCountsError && jobCounts) {
        embeddingJobs.queued = jobCounts.filter((j: any) => j.status === 'queued').length
        embeddingJobs.processing = jobCounts.filter((j: any) => j.status === 'processing').length
        embeddingJobs.succeeded = jobCounts.filter((j: any) => j.status === 'succeeded').length
        embeddingJobs.failed = jobCounts.filter((j: any) => j.status === 'failed').length
      }

      // Get recent jobs (last 10)
      const { data: recentJobs, error: recentJobsError } = await supabase
        .from('embedding_jobs')
        .select('job_id, artifact_id, status, error_message, created_at, completed_at')
        .in('artifact_id', artifactIds)
        .order('created_at', { ascending: false })
        .limit(10)

      if (!recentJobsError && recentJobs) {
        embeddingJobs.recentJobs = recentJobs as typeof embeddingJobs.recentJobs
      }
    }

    const artifactsList = (artifacts || []) as Array<{
      artifact_id: string
      ticket_pk: string
      agent_type: string
      title: string
      body_md?: string
      created_at: string
    }>

    const attemptsList = (attempts || []) as Array<{
      attempt_id: string
      ticket_pk: string
      artifact_type: string
      agent_type: string
      endpoint: string
      outcome: string
      error_message?: string
      validation_reason?: string
      attempted_at: string
    }>

    // Build diagnostics for each required artifact type
    const diagnostics = requiredArtifactTypes.map(({ key, title }) => {
      // Find all artifacts of this type (implementation agent only)
      const matchingArtifacts = artifactsList.filter((a) => {
        if (a.agent_type !== 'implementation') return false
        const extractedType = extractArtifactTypeFromTitle(a.title)
        return extractedType === key
      })

      // Count artifacts with substantive content
      const artifactsWithContent = matchingArtifacts.filter((a) => {
        const body = a.body_md || ''
        return body.trim().length > 50 && !body.includes('(none)') && !body.includes('(No files changed')
      })

      const isPresent = artifactsWithContent.length > 0
      const rowCount = matchingArtifacts.length

      // Find last attempt for this artifact type (implementation agent only)
      const lastAttempt = attemptsList
        .filter((a) => a.artifact_type === key && a.agent_type === 'implementation')
        .sort((a, b) => new Date(b.attempted_at).getTime() - new Date(a.attempted_at).getTime())[0]

      return {
        artifactType: key,
        title,
        isPresent,
        rowCount,
        lastAttempt: lastAttempt
          ? {
              timestamp: lastAttempt.attempted_at,
              endpoint: lastAttempt.endpoint,
              outcome: lastAttempt.outcome,
              errorMessage: lastAttempt.error_message || undefined,
              validationReason: lastAttempt.validation_reason || undefined,
            }
          : null,
      }
    })

    // Check if retrieval failed
    const retrievalError = artifactsError ? {
      message: artifactsError.message,
      httpStatus: 500,
    } : null

    json(res, 200, {
      success: true,
      diagnostics,
      retrievalError,
      embeddingJobs,
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      diagnostics: null,
    })
  }
}
