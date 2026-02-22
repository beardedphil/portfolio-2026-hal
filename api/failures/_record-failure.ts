/**
 * Shared utility for recording failures in the failure library.
 * Used by both drift attempts and agent outcomes to ensure consistent schema.
 * 
 * Ticket HAL-0784: Failure library system
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'

export interface FailureRecordInput {
  /** Type of failure: 'drift', 'agent_outcome', 'qa', 'hitl', etc. */
  failure_type: string
  /** Root cause description (optional) */
  root_cause?: string | null
  /** Prevention candidate/strategy (optional) */
  prevention_candidate?: string | null
  /** Stable fingerprint/key to identify recurrences. If not provided, will be generated from failure_type + root_cause + references */
  fingerprint?: string | null
  /** Optional references (ticket_pk, drift_attempt_id, agent_run_id, etc.) */
  references?: Record<string, unknown> | null
}

/**
 * Generate a stable fingerprint from failure characteristics.
 * Used to identify recurrences of the same failure.
 */
export function generateFailureFingerprint(input: FailureRecordInput): string {
  // If fingerprint is explicitly provided, use it
  if (input.fingerprint) {
    return input.fingerprint
  }

  // Otherwise, generate from failure characteristics
  // Note: We exclude ticket_pk from fingerprint to group the same failure pattern across tickets
  // If ticket-specific grouping is needed, provide a custom fingerprint
  const components = [
    input.failure_type,
    input.root_cause || '',
    // Include agent_run_id or drift_attempt_id only if they represent a specific failure instance
    // (not included by default to allow grouping across tickets)
  ]

  const combined = components.join('|')
  return createHash('sha256').update(combined).digest('hex')
}

/**
 * Record a failure in the failure library.
 * If a failure with the same fingerprint exists, increments recurrence_count and updates last_seen_at.
 * Otherwise, creates a new failure record.
 * 
 * @param supabase Supabase client (must have service role permissions)
 * @param input Failure record input
 * @returns The created or updated failure record
 */
export async function recordFailure(
  supabase: SupabaseClient,
  input: FailureRecordInput
): Promise<{ success: true; failure: any } | { success: false; error: string }> {
  try {
    // Validate required fields
    if (!input.failure_type || !input.failure_type.trim()) {
      return { success: false, error: 'failure_type is required' }
    }

    // Generate fingerprint if not provided
    const fingerprint = generateFailureFingerprint(input)

    // Check if failure with this fingerprint already exists
    const { data: existing, error: fetchError } = await supabase
      .from('failures')
      .select('id, recurrence_count, first_seen_at')
      .eq('fingerprint', fingerprint)
      .single()

    if (fetchError && fetchError.code !== 'PGRST116') {
      // PGRST116 is "not found" - that's expected for new failures
      return { success: false, error: `Failed to check existing failure: ${fetchError.message}` }
    }

    if (existing) {
      // Update existing failure: increment recurrence_count and update last_seen_at
      const { data: updated, error: updateError } = await supabase
        .from('failures')
        .update({
          recurrence_count: existing.recurrence_count + 1,
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          // Optionally update root_cause and prevention_candidate if provided (merge with existing)
          ...(input.root_cause !== undefined && { root_cause: input.root_cause || null }),
          ...(input.prevention_candidate !== undefined && { prevention_candidate: input.prevention_candidate || null }),
          // Merge references if provided
          ...(input.references && {
            references: {
              ...(existing.references || {}),
              ...input.references,
            },
          }),
        })
        .eq('fingerprint', fingerprint)
        .select()
        .single()

      if (updateError) {
        return { success: false, error: `Failed to update failure: ${updateError.message}` }
      }

      return { success: true, failure: updated }
    } else {
      // Create new failure record
      const { data: created, error: createError } = await supabase
        .from('failures')
        .insert({
          failure_type: input.failure_type.trim(),
          fingerprint,
          root_cause: input.root_cause?.trim() || null,
          prevention_candidate: input.prevention_candidate?.trim() || null,
          recurrence_count: 1,
          first_seen_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
          references: input.references || {},
        })
        .select()
        .single()

      if (createError) {
        return { success: false, error: `Failed to create failure: ${createError.message}` }
      }

      return { success: true, failure: created }
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    return { success: false, error: `Unexpected error recording failure: ${errorMessage}` }
  }
}
