import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'

export interface FailureInput {
  failureType: string
  rootCause?: string | null
  preventionCandidate?: string | null
  sourceType: 'drift_attempt' | 'agent_outcome'
  sourceId?: string | null
  ticketPk?: string | null
  metadata?: Record<string, any>
}

/**
 * Generate a stable fingerprint for a failure based on its normalized signature.
 * This is used to identify recurrences of the same failure.
 */
export function generateFailureFingerprint(input: FailureInput): string {
  // Normalize the failure signature by combining:
  // - failure_type
  // - source_type
  // - normalized metadata (excluding timestamps and IDs that change)
  const normalized = {
    failureType: input.failureType.trim().toUpperCase(),
    sourceType: input.sourceType,
    // Include relevant metadata keys but exclude volatile ones
    metadata: input.metadata
      ? Object.keys(input.metadata)
          .sort()
          .filter((k) => !['timestamp', 'created_at', 'updated_at', 'id'].includes(k))
          .reduce((acc, k) => {
            acc[k] = input.metadata![k]
            return acc
          }, {} as Record<string, any>)
      : {},
  }

  const signature = JSON.stringify(normalized)
  return createHash('sha256').update(signature).digest('hex')
}

/**
 * Create or update a failure record in the failures table.
 * If a failure with the same fingerprint exists, increment recurrence_count and update last_seen_at.
 * Otherwise, create a new record.
 */
export async function upsertFailure(
  supabase: SupabaseClient,
  input: FailureInput
): Promise<{ success: boolean; failureId?: string; error?: string; isNew?: boolean }> {
  try {
    // Validate required fields
    if (!input.failureType || !input.failureType.trim()) {
      return { success: false, error: 'failure_type is required' }
    }

    const fingerprint = generateFailureFingerprint(input)
    const now = new Date().toISOString()

    // Check if a failure with this fingerprint already exists
    const { data: existing, error: fetchError } = await supabase
      .from('failures')
      .select('id, recurrence_count')
      .eq('fingerprint', fingerprint)
      .single()

    if (fetchError && fetchError.code !== 'PGRST116') {
      // PGRST116 = no rows returned (expected for new failures)
      return { success: false, error: `Failed to check existing failure: ${fetchError.message}` }
    }

    if (existing) {
      // Update existing failure: increment recurrence_count and update last_seen_at
      const { data: updated, error: updateError } = await supabase
        .from('failures')
        .update({
          recurrence_count: existing.recurrence_count + 1,
          last_seen_at: now,
          // Update root_cause and prevention_candidate if provided (use latest values)
          ...(input.rootCause !== undefined && { root_cause: input.rootCause }),
          ...(input.preventionCandidate !== undefined && { prevention_candidate: input.preventionCandidate }),
          // Update metadata if provided
          ...(input.metadata && { metadata: input.metadata }),
          updated_at: now,
        })
        .eq('fingerprint', fingerprint)
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
          failure_type: input.failureType.trim(),
          fingerprint,
          root_cause: input.rootCause || null,
          prevention_candidate: input.preventionCandidate || null,
          recurrence_count: 1,
          first_seen_at: now,
          last_seen_at: now,
          source_type: input.sourceType,
          source_id: input.sourceId || null,
          ticket_pk: input.ticketPk || null,
          metadata: input.metadata || {},
        })
        .select('id')
        .single()

      if (insertError) {
        return { success: false, error: `Failed to create failure: ${insertError.message}` }
      }

      return { success: true, failureId: created.id, isNew: true }
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    return { success: false, error: `Unexpected error: ${errorMessage}` }
  }
}

/**
 * Create a failure record from a drift attempt.
 */
export async function createFailureFromDriftAttempt(
  supabase: SupabaseClient,
  driftAttemptId: string,
  ticketPk: string,
  failureReasons: Array<{ type: string; message: string }>,
  transition?: string | null,
  metadata?: Record<string, any>
): Promise<{ success: boolean; failureId?: string; error?: string }> {
  // Extract failure type from the first failure reason, or use a default
  const primaryFailureType = failureReasons.length > 0 ? failureReasons[0].type : 'DRIFT_FAILURE'
  
  // Combine all failure reason messages as root cause
  const rootCause = failureReasons.map((r) => `${r.type}: ${r.message}`).join('\n')

  // Build metadata from transition and other context
  const failureMetadata = {
    transition: transition || null,
    failureReasons: failureReasons,
    ...metadata,
  }

  return upsertFailure(supabase, {
    failureType: primaryFailureType,
    rootCause,
    sourceType: 'drift_attempt',
    sourceId: driftAttemptId,
    ticketPk,
    metadata: failureMetadata,
  })
}

/**
 * Create a failure record from an agent outcome.
 */
export async function createFailureFromAgentOutcome(
  supabase: SupabaseClient,
  agentRunId: string,
  agentType: string,
  ticketPk: string | null,
  failureType: string,
  rootCause?: string | null,
  preventionCandidate?: string | null,
  metadata?: Record<string, any>
): Promise<{ success: boolean; failureId?: string; error?: string }> {
  const failureMetadata = {
    agentType,
    ...metadata,
  }

  return upsertFailure(supabase, {
    failureType,
    rootCause,
    preventionCandidate,
    sourceType: 'agent_outcome',
    sourceId: agentRunId,
    ticketPk: ticketPk || null,
    metadata: failureMetadata,
  })
}
