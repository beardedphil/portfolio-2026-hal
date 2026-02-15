/**
 * Shared utilities for artifact normalization and canonical matching (0121).
 */

/**
 * The 8 required implementation artifact type keys. Single source of truth for move-to-QA gate,
 * implementation prompt, and QA/Kanban checks.
 */
export const REQUIRED_IMPLEMENTATION_ARTIFACT_TYPES = [
  'plan',
  'worklog',
  'changed-files',
  'decisions',
  'verification',
  'pm-review',
  'git-diff',
  'instructions-used',
] as const

export type RequiredImplementationArtifactType = (typeof REQUIRED_IMPLEMENTATION_ARTIFACT_TYPES)[number]

/** Artifact row as returned from agent_artifacts (minimal shape for readiness check). */
export interface ArtifactRowForCheck {
  title?: string | null
  agent_type?: string | null
  body_md?: string | null
}

/**
 * Returns true if body_md is substantive (matches Kanban/QA rules: length > 50, no placeholders).
 */
function isSubstantiveBody(body_md: string | null | undefined): boolean {
  if (body_md == null) return false
  const trimmed = body_md.trim()
  if (trimmed.length <= 50) return false
  if (trimmed.includes('(none)')) return false
  if (trimmed.includes('(No files changed')) return false
  return true
}

/**
 * Given a list of artifacts for a ticket, returns which required implementation artifact types
 * are missing or not substantive. Used by the move-to-QA gate and can be used by agents/UI.
 * Matches Kanban logic: implementation agent_type, title matches type, substantive body_md.
 */
export function getMissingRequiredImplementationArtifacts(
  artifacts: ArtifactRowForCheck[]
): string[] {
  const hasSubstantive = (type: string): boolean => {
    const typeLower = type.toLowerCase()
    return artifacts.some((a) => {
      if (a.agent_type !== 'implementation') return false
      const extracted = extractArtifactTypeFromTitle(a.title || '')
      if (extracted !== typeLower) return false
      return isSubstantiveBody(a.body_md)
    })
  }
  return REQUIRED_IMPLEMENTATION_ARTIFACT_TYPES.filter((key) => !hasSubstantive(key))
}

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
 *   "Instructions Used for ticket 0121" -> "instructions-used"
 *   "Missing Artifact Explanation" -> "missing-artifact-explanation"
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
  if (normalized.startsWith('git diff for ticket') || normalized.startsWith('git-diff for ticket')) return 'git-diff'
  if (normalized.startsWith('instructions used for ticket')) return 'instructions-used'
  
  // QA artifact type
  if (normalized.startsWith('qa report for ticket')) return 'qa-report'
  
  // Missing Artifact Explanation (0200) - exact match or starts with
  if (normalized === 'missing artifact explanation' || normalized.startsWith('missing artifact explanation')) return 'missing-artifact-explanation'
  
  return null
}

/**
 * Checks if a "Missing Artifact Explanation" artifact exists for the given artifacts.
 * The artifact must have a substantive body_md (length > 50, no placeholders).
 * Used by the ticket move gate to allow movement when artifacts are missing but explained.
 */
export function hasMissingArtifactExplanation(artifacts: ArtifactRowForCheck[]): boolean {
  return artifacts.some((a) => {
    const extracted = extractArtifactTypeFromTitle(a.title || '')
    if (extracted !== 'missing-artifact-explanation') return false
    return isSubstantiveBody(a.body_md)
  })
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
 * Special case: "missing-artifact-explanation" uses a fixed title without ticket ID (0200).
 */
export function createCanonicalTitle(
  artifactType: string,
  displayId: string
): string {
  // Special case: Missing Artifact Explanation uses fixed title (0200)
  if (artifactType === 'missing-artifact-explanation') {
    return 'Missing Artifact Explanation'
  }
  
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
    'git-diff': `Git diff for ticket ${normalizedDisplayId}`,
    'instructions-used': `Instructions Used for ticket ${normalizedDisplayId}`,
  }
  
  return titleMap[artifactType] || `Artifact for ticket ${normalizedDisplayId}`
}

/**
 * Checks if a "Missing Artifact Explanation" artifact exists for a ticket.
 * The artifact can be identified by title containing "Missing Artifact Explanation"
 * or by artifact_type being "missing-artifact-explanation".
 * Used by the move-to-QA gate to allow tickets with missing artifacts when an explanation is provided.
 */
export function hasMissingArtifactExplanation(
  artifacts: ArtifactRowForCheck[]
): boolean {
  return artifacts.some((a) => {
    const titleLower = (a.title || '').toLowerCase().trim()
    // Check if title contains "missing artifact explanation"
    if (titleLower.includes('missing artifact explanation')) {
      return true
    }
    // Also check for artifact_type field if it exists (for future extensibility)
    // Note: ArtifactRowForCheck doesn't include artifact_type, but we can check title patterns
    return false
  })
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
