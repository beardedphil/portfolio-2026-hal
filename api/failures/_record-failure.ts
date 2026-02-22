import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

/**
 * Compute a stable fingerprint for a failure based on its characteristics.
 * This fingerprint is used to identify recurrences of the same failure.
 */
export function computeFailureFingerprint(params: {
  failureType: string
  rootCause?: string | null
  additionalContext?: Record<string, unknown>
}): string {
  const { failureType, rootCause, additionalContext } = params
  
  // Normalize root cause for fingerprinting (remove whitespace, lowercase)
  const normalizedRootCause = rootCause
    ? rootCause.trim().toLowerCase().replace(/\s+/g, ' ')
    : ''
  
  // Build fingerprint components
  const components = [
    failureType,
    normalizedRootCause,
    additionalContext ? JSON.stringify(additionalContext, Object.keys(additionalContext).sort()) : '',
  ]
  
  // Create hash of components
  const hash = crypto
    .createHash('sha256')
    .update(components.join('|'))
    .digest('hex')
  
  return hash
}

/**
 * Record a failure in the failures table.
 * If a failure with the same fingerprint already exists, increment recurrence_count and update last_seen_at.
 * Otherwise, create a new failure record.
 */
export async function recordFailure(params: {
  supabaseUrl: string
  supabaseAnonKey: string
  failureType: string
  rootCause?: string | null
  preventionCandidate?: string | null
  additionalContext?: Record<string, unknown>
}): Promise<{ success: boolean; failureId?: string; error?: string; isNew?: boolean }> {
  const { supabaseUrl, supabaseAnonKey, failureType, rootCause, preventionCandidate, additionalContext } = params
  
  if (!failureType || !failureType.trim()) {
    return { success: false, error: 'failureType is required' }
  }
  
  const supabase = createClient(supabaseUrl, supabaseAnonKey)
  
  // Compute fingerprint
  const fingerprint = computeFailureFingerprint({
    failureType,
    rootCause,
    additionalContext,
  })
  
  // Check if failure with this fingerprint already exists
  const { data: existing, error: lookupError } = await supabase
    .from('failures')
    .select('id, recurrence_count')
    .eq('fingerprint', fingerprint)
    .maybeSingle()
  
  if (lookupError && lookupError.code !== 'PGRST116') {
    // PGRST116 is "not found" which is fine, other errors are real problems
    return { success: false, error: `Failed to lookup existing failure: ${lookupError.message}` }
  }
  
  if (existing) {
    // Update existing failure: increment recurrence_count and update last_seen_at
    const { data: updated, error: updateError } = await supabase
      .from('failures')
      .update({
        recurrence_count: existing.recurrence_count + 1,
        last_seen_at: new Date().toISOString(),
        // Optionally update root_cause and prevention_candidate if they've changed
        // (for now, we keep the original values)
      })
      .eq('id', existing.id)
      .select('id')
      .single()
    
    if (updateError) {
      return { success: false, error: `Failed to update failure: ${updateError.message}` }
    }
    
    return { success: true, failureId: updated.id, isNew: false }
  } else {
    // Create new failure record
    const { data: created, error: insertError } = await supabase
      .from('failures')
      .insert({
        failure_type: failureType,
        fingerprint,
        root_cause: rootCause || null,
        prevention_candidate: preventionCandidate || null,
        recurrence_count: 1,
        first_seen_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    
    if (insertError) {
      return { success: false, error: `Failed to create failure: ${insertError.message}` }
    }
    
    return { success: true, failureId: created.id, isNew: true }
  }
}

/**
 * Record a failure from a drift attempt.
 * Extracts failure information from drift_attempts table structure.
 */
export async function recordFailureFromDriftAttempt(params: {
  supabaseUrl: string
  supabaseAnonKey: string
  driftAttemptId: string
}): Promise<{ success: boolean; failureId?: string; error?: string }> {
  const { supabaseUrl, supabaseAnonKey, driftAttemptId } = params
  
  const supabase = createClient(supabaseUrl, supabaseAnonKey)
  
  // Fetch drift attempt
  const { data: driftAttempt, error: fetchError } = await supabase
    .from('drift_attempts')
    .select('failure_reasons, transition, ticket_pk, evaluation_error')
    .eq('id', driftAttemptId)
    .maybeSingle()
  
  if (fetchError || !driftAttempt) {
    return { success: false, error: `Failed to fetch drift attempt: ${fetchError?.message || 'not found'}` }
  }
  
  // Extract failure information
  const failureReasons = (driftAttempt.failure_reasons as Array<{ type: string; message: string }> | null) || []
  const transition = driftAttempt.transition || 'unknown'
  const evaluationError = driftAttempt.evaluation_error || null
  
  // Build root cause from failure reasons
  const rootCauseParts: string[] = []
  if (transition) {
    rootCauseParts.push(`Transition: ${transition}`)
  }
  if (evaluationError) {
    rootCauseParts.push(`Error: ${evaluationError}`)
  }
  if (failureReasons.length > 0) {
    rootCauseParts.push(
      ...failureReasons.map((r) => `${r.type}: ${r.message}`)
    )
  }
  const rootCause = rootCauseParts.length > 0 ? rootCauseParts.join('; ') : 'Drift attempt failed'
  
  // Build prevention candidate
  const preventionCandidate = failureReasons.length > 0
    ? `Review failure reasons and address root causes: ${failureReasons.map((r) => r.type).join(', ')}`
    : 'Review drift gate configuration and transition requirements'
  
  // Record failure
  return recordFailure({
    supabaseUrl,
    supabaseAnonKey,
    failureType: 'DRIFT_ATTEMPT',
    rootCause,
    preventionCandidate,
    additionalContext: {
      drift_attempt_id: driftAttemptId,
      ticket_pk: driftAttempt.ticket_pk,
      transition,
      failure_reason_count: failureReasons.length,
    },
  })
}

/**
 * Record a failure from an agent outcome.
 * Extracts failure information from hal_agent_runs table structure.
 */
export async function recordFailureFromAgentOutcome(params: {
  supabaseUrl: string
  supabaseAnonKey: string
  agentRunId: string
}): Promise<{ success: boolean; failureId?: string; error?: string }> {
  const { supabaseUrl, supabaseAnonKey, agentRunId } = params
  
  const supabase = createClient(supabaseUrl, supabaseAnonKey)
  
  // Fetch agent run
  const { data: agentRun, error: fetchError } = await supabase
    .from('hal_agent_runs')
    .select('agent_type, status, error, ticket_pk, ticket_number, display_id')
    .eq('run_id', agentRunId)
    .maybeSingle()
  
  if (fetchError || !agentRun) {
    return { success: false, error: `Failed to fetch agent run: ${fetchError?.message || 'not found'}` }
  }
  
  // Only record failures (status = 'failed' or error is present)
  if (agentRun.status !== 'failed' && !agentRun.error) {
    return { success: false, error: 'Agent run is not a failure (status is not "failed" and no error present)' }
  }
  
  // Build root cause
  const rootCauseParts: string[] = []
  if (agentRun.error) {
    rootCauseParts.push(`Error: ${agentRun.error}`)
  }
  if (agentRun.status) {
    rootCauseParts.push(`Status: ${agentRun.status}`)
  }
  const rootCause = rootCauseParts.length > 0 ? rootCauseParts.join('; ') : 'Agent run failed'
  
  // Build prevention candidate
  const preventionCandidate = agentRun.error
    ? `Review error message and address root cause: ${agentRun.error.substring(0, 100)}`
    : `Review agent run configuration and ensure proper error handling for ${agentRun.agent_type} agent`
  
  // Record failure
  return recordFailure({
    supabaseUrl,
    supabaseAnonKey,
    failureType: 'AGENT_OUTCOME',
    rootCause,
    preventionCandidate,
    additionalContext: {
      agent_run_id: agentRunId,
      agent_type: agentRun.agent_type,
      ticket_pk: agentRun.ticket_pk,
      ticket_number: agentRun.ticket_number,
      display_id: agentRun.display_id,
    },
  })
}
