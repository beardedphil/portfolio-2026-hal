/**
 * Helper function to log artifact storage attempts for diagnostics (0175).
 */

export async function logStorageAttempt(
  supabase: any,
  ticketPk: string,
  repoFullName: string,
  artifactType: string,
  agentType: 'implementation' | 'qa',
  endpoint: string,
  outcome: 'stored' | 'rejected by validation' | 'request failed',
  errorMessage?: string,
  validationReason?: string
): Promise<void> {
  try {
    await supabase.from('artifact_storage_attempts').insert({
      ticket_pk: ticketPk,
      repo_full_name: repoFullName,
      artifact_type: artifactType,
      agent_type: agentType,
      endpoint,
      outcome,
      error_message: errorMessage || null,
      validation_reason: validationReason || null,
    })
  } catch (err) {
    // Log but don't fail - diagnostics logging should not break artifact insertion
    console.warn(`[logStorageAttempt] Failed to log attempt: ${err instanceof Error ? err.message : String(err)}`)
  }
}
