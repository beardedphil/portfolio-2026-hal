import type { IncomingMessage, ServerResponse } from 'http'
import { recordFailure, recordFailureFromDriftAttempt, recordFailureFromAgentOutcome } from './_record-failure.js'

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
    json(res, 405, { success: false, error: 'Method Not Allowed' })
    return
  }

  try {
    const body = (await readJsonBody(req)) as {
      source: 'direct' | 'drift_attempt' | 'agent_outcome'
      supabaseUrl?: string
      supabaseAnonKey?: string
      // For direct recording
      failureType?: string
      rootCause?: string | null
      preventionCandidate?: string | null
      additionalContext?: Record<string, unknown>
      // For drift attempt
      driftAttemptId?: string
      // For agent outcome
      agentRunId?: string
    }

    const source = body.source || 'direct'
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
      })
      return
    }

    let result: { success: boolean; failureId?: string; error?: string; isNew?: boolean }

    if (source === 'drift_attempt') {
      if (!body.driftAttemptId) {
        json(res, 400, { success: false, error: 'driftAttemptId is required when source is "drift_attempt"' })
        return
      }
      result = await recordFailureFromDriftAttempt({
        supabaseUrl,
        supabaseAnonKey,
        driftAttemptId: body.driftAttemptId,
      })
    } else if (source === 'agent_outcome') {
      if (!body.agentRunId) {
        json(res, 400, { success: false, error: 'agentRunId is required when source is "agent_outcome"' })
        return
      }
      result = await recordFailureFromAgentOutcome({
        supabaseUrl,
        supabaseAnonKey,
        agentRunId: body.agentRunId,
      })
    } else {
      // Direct recording
      if (!body.failureType) {
        json(res, 400, { success: false, error: 'failureType is required when source is "direct"' })
        return
      }
      result = await recordFailure({
        supabaseUrl,
        supabaseAnonKey,
        failureType: body.failureType,
        rootCause: body.rootCause,
        preventionCandidate: body.preventionCandidate,
        additionalContext: body.additionalContext,
      })
    }

    if (!result.success) {
      json(res, 500, result)
      return
    }

    json(res, 200, result)
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
