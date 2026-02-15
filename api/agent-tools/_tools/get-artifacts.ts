import type { SupabaseClient } from '@supabase/supabase-js'

export interface GetArtifactsParams {
  ticketId: string
  summary?: boolean
}

export interface GetArtifactsResult {
  success: boolean
  artifacts?: any[]
  summary?: {
    total: number
    blank: number
    populated: number
  }
  error?: string
}

/**
 * Determines if an artifact is blank (empty or placeholder-only) vs populated.
 */
function isArtifactBlank(body_md: string | null | undefined, title: string): boolean {
  if (!body_md || body_md.trim().length === 0) {
    return true
  }

  // Use the same validation logic as hasSubstantiveContent but return boolean
  const withoutHeadings = body_md
    .replace(/^#{1,6}\s+.*$/gm, '') // Remove markdown headings
    .replace(/^[-*+]\s+.*$/gm, '') // Remove bullet points
    .replace(/^\d+\.\s+.*$/gm, '') // Remove numbered lists
    .trim()

  if (withoutHeadings.length === 0) {
    return true
  }

  // Check for minimum length
  if (withoutHeadings.length < 30) {
    return true
  }

  // Check for placeholder patterns
  const placeholderPatterns = [
    /^#\s+[^\n]+\n*$/m, // Just a single heading
    /^#\s+[^\n]+\n+(TODO|TBD|placeholder|coming soon|not yet|to be determined)/i,
    /^(TODO|TBD|placeholder|coming soon|not yet|to be determined)/i,
  ]

  for (const pattern of placeholderPatterns) {
    if (pattern.test(body_md)) {
      return true
    }
  }

  return false
}

/**
 * Extracts a snippet from artifact body (first 200 chars of non-heading content).
 */
function extractSnippet(body_md: string | null | undefined): string {
  if (!body_md) {
    return ''
  }

  // Remove markdown headings to get actual content
  const withoutHeadings = body_md
    .replace(/^#{1,6}\s+.*$/gm, '')
    .trim()

  if (withoutHeadings.length === 0) {
    return ''
  }

  // Take first 200 characters, breaking at word boundary if possible
  const snippet = withoutHeadings.substring(0, 200)
  const lastSpace = snippet.lastIndexOf(' ')
  if (lastSpace > 150 && lastSpace < 200) {
    return snippet.substring(0, lastSpace) + '...'
  }

  return snippet.length < withoutHeadings.length ? snippet + '...' : snippet
}

/**
 * Gets all artifacts for a ticket, optionally in summary mode.
 */
export async function getArtifacts(
  supabase: SupabaseClient,
  params: GetArtifactsParams
): Promise<GetArtifactsResult> {
  const ticketNumber = parseInt(params.ticketId, 10)
  if (!Number.isFinite(ticketNumber)) {
    return { success: false, error: `Invalid ticket ID: ${params.ticketId}. Expected numeric ID.` }
  }

  // Try to find ticket by ticket_number (repo-scoped) or id (legacy)
  const { data: ticket, error: ticketError } = await supabase
    .from('tickets')
    .select('pk')
    .or(`ticket_number.eq.${ticketNumber},id.eq.${params.ticketId}`)
    .maybeSingle()

  if (ticketError) {
    return { success: false, error: `Supabase fetch failed: ${ticketError.message}` }
  }

  if (!ticket) {
    return { success: false, error: `Ticket ${params.ticketId} not found.` }
  }

  const ticketPk = (ticket as { pk?: string }).pk
  if (!ticketPk) {
    return { success: false, error: `Ticket ${params.ticketId} missing pk.` }
  }

  // Fetch all artifacts for this ticket
  const { data: artifacts, error: artifactsError } = await supabase
    .from('agent_artifacts')
    .select('artifact_id, ticket_pk, agent_type, title, body_md, created_at, updated_at')
    .eq('ticket_pk', ticketPk)
    .order('created_at', { ascending: false })

  if (artifactsError) {
    return { success: false, error: `Failed to fetch artifacts: ${artifactsError.message}` }
  }

  const artifactsList = artifacts || []

  // If summary mode is requested, return summarized data
  if (params.summary) {
    const summarized = artifactsList.map((artifact: any) => {
      const body_md = artifact.body_md || ''
      const isBlank = isArtifactBlank(body_md, artifact.title || '')
      const snippet = extractSnippet(body_md)
      const contentLength = body_md.length

      return {
        artifact_id: artifact.artifact_id,
        agent_type: artifact.agent_type,
        title: artifact.title,
        is_blank: isBlank,
        content_length: contentLength,
        snippet: snippet,
        created_at: artifact.created_at,
        updated_at: artifact.updated_at || artifact.created_at,
      }
    })

    // Count blank vs populated
    const blankCount = summarized.filter((a: any) => a.is_blank).length
    const populatedCount = summarized.length - blankCount

    return {
      success: true,
      artifacts: summarized,
      summary: {
        total: summarized.length,
        blank: blankCount,
        populated: populatedCount,
      },
    }
  }

  // Return full artifacts (existing behavior)
  return { success: true, artifacts: artifactsList }
}
