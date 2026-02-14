/**
 * Shared utilities for artifact normalization and canonical matching (0121).
 */

/**
 * Extracts the artifact type from a title.
 * Examples:
 *   "Plan for ticket 0121" -> "plan"
 *   "Worklog for ticket HAL-0121" -> "worklog"
 *   "Changed Files for ticket 0121" -> "changed-files"
 *   "Decisions for ticket 0121" -> "decisions"
 *   "Verification for ticket 0121" -> "verification"
 *   "PM Review for ticket 0121" -> "pm-review"
 *   "QA report for ticket 0121" -> "qa-report"
 *   "Image for ticket 0121" -> "image"
 */
export function extractArtifactTypeFromTitle(title: string): string | null {
  const normalized = title.toLowerCase().trim()
  
  // Implementation artifact types
  if (normalized.startsWith('plan for ticket')) return 'plan'
  if (normalized.startsWith('worklog for ticket')) return 'worklog'
  if (normalized.startsWith('changed files for ticket')) return 'changed-files'
  if (normalized.startsWith('decisions for ticket')) return 'decisions'
  if (normalized.startsWith('verification for ticket')) return 'verification'
  if (normalized.startsWith('pm review for ticket')) return 'pm-review'
  if (normalized.startsWith('image for ticket')) return 'image'
  
  // QA artifact type
  if (normalized.startsWith('qa report for ticket')) return 'qa-report'
  
  return null
}

/**
 * Normalizes a ticket ID from various formats to a canonical numeric string.
 * Examples:
 *   "HAL-0121" -> "0121"
 *   "0121" -> "0121"
 *   "121" -> "0121" (zero-padded to 4 digits)
 */
export function normalizeTicketId(ticketId: string): string {
  // Remove any prefix like "HAL-"
  const withoutPrefix = ticketId.replace(/^[A-Z]+-/, '')
  
  // Extract numeric part
  const numericMatch = withoutPrefix.match(/\d+/)
  if (!numericMatch) return ticketId // Return as-is if no numeric part found
  
  const numeric = numericMatch[0]
  
  // Zero-pad to 4 digits if it's a number
  const num = parseInt(numeric, 10)
  if (Number.isFinite(num)) {
    return num.toString().padStart(4, '0')
  }
  
  return numeric
}

/**
 * Creates a canonical artifact title using the ticket's display_id.
 * This ensures consistent formatting across all artifacts for a ticket.
 */
export function createCanonicalTitle(
  artifactType: string,
  displayId: string
): string {
  const normalizedDisplayId = displayId || normalizeTicketId(displayId)
  
  const titleMap: Record<string, string> = {
    'plan': `Plan for ticket ${normalizedDisplayId}`,
    'worklog': `Worklog for ticket ${normalizedDisplayId}`,
    'changed-files': `Changed Files for ticket ${normalizedDisplayId}`,
    'decisions': `Decisions for ticket ${normalizedDisplayId}`,
    'verification': `Verification for ticket ${normalizedDisplayId}`,
    'pm-review': `PM Review for ticket ${normalizedDisplayId}`,
    'qa-report': `QA report for ticket ${normalizedDisplayId}`,
    'image': `Image for ticket ${normalizedDisplayId}`,
  }
  
  return titleMap[artifactType] || `Artifact for ticket ${normalizedDisplayId}`
}

/**
 * Finds existing artifacts by canonical identifier (ticket_pk + agent_type + artifact_type)
 * instead of exact title match. This handles cases where titles have different formats.
 */
export async function findArtifactsByCanonicalId(
  supabase: any,
  ticketPk: string,
  agentType: 'implementation' | 'qa',
  artifactType: string
): Promise<{
  artifacts: Array<{ artifact_id: string; body_md?: string; created_at: string; title: string }>
  error: string | null
}> {
  // Get all artifacts for this ticket and agent type
  const { data: allArtifacts, error: findError } = await supabase
    .from('agent_artifacts')
    .select('artifact_id, body_md, created_at, title')
    .eq('ticket_pk', ticketPk)
    .eq('agent_type', agentType)
    .order('created_at', { ascending: false })

  if (findError) {
    return { artifacts: [], error: `Failed to query artifacts: ${findError.message}` }
  }

  const artifacts = (allArtifacts || []) as Array<{
    artifact_id: string
    body_md?: string
    created_at: string
    title: string
  }>

  // Filter to artifacts that match the artifact type (by extracting type from title)
  const matchingArtifacts = artifacts.filter((artifact) => {
    const extractedType = extractArtifactTypeFromTitle(artifact.title)
    return extractedType === artifactType
  })

  return { artifacts: matchingArtifacts, error: null }
}
