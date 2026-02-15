/** Shared utility functions for ticket detail modal components */

/** Get display name for agent type (0082) */
export function getAgentTypeDisplayName(agentType: string): string {
  switch (agentType) {
    case 'implementation':
      return 'Implementation report'
    case 'qa':
      return 'QA report'
    case 'human-in-the-loop':
      return 'Human-in-the-Loop report'
    case 'other':
      return 'Other agent report'
    default:
      return `${agentType} report`
  }
}

/** Best-effort priority from frontmatter or body (e.g. **Priority**: P1 or # Priority) */
export function extractPriority(frontmatter: Record<string, string>, body: string): string | null {
  const p = frontmatter.Priority ?? frontmatter.priority
  if (p && p.trim()) return p.trim()
  const m = body.match(/\*\*Priority\*\*:\s*(\S+)/)
  if (m) return m[1]
  const m2 = body.match(/# Priority\s*\n\s*(\S+)/)
  if (m2) return m2[1]
  return null
}
