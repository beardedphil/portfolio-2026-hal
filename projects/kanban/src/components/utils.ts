/** Extract feature branch name from ticket body_md QA section. Returns branch name or null. */
export function extractFeatureBranch(bodyMd: string | null): string | null {
  if (!bodyMd) return null
  // Look for "**Branch**: `branch-name`" or "- **Branch**: `branch-name`" in QA section
  const branchMatch = bodyMd.match(/(?:^|\n)(?:- )?\*\*Branch\*\*:\s*`([^`]+)`/i)
  return branchMatch ? branchMatch[1].trim() : null
}

/** Check if ticket body_md indicates branch was merged to main. Returns { merged: boolean, timestamp: string | null }. */
export function checkMergedToMain(bodyMd: string | null): { merged: boolean; timestamp: string | null } {
  if (!bodyMd) return { merged: false, timestamp: null }
  
  // Look for "Merged to main" confirmation in QA section or anywhere in body
  const mergedPatterns = [
    /(?:^|\n)(?:- )?\*\*Merged to main\*\*:\s*Yes/i,
    /(?:^|\n)(?:- )?\*\*Merged to main\*\*:\s*✅/i,
    /merged to main for (?:cloud )?qa access/i,
    /merged.*main.*qa/i,
    /Merged to main:\s*Yes/i,
    /Merged to main:\s*✅/i,
  ]
  
  const hasMerged = mergedPatterns.some(pattern => pattern.test(bodyMd))
  
  // Try to extract timestamp if present (look for ISO date or common date formats near "merged" text)
  const timestampMatch = bodyMd.match(/(?:merged|Merged).*?(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}|[\d\/]+\s+[\d:]+)/i)
  const timestamp = timestampMatch ? timestampMatch[1] : null
  
  return { merged: hasMerged, timestamp }
}

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

/** Strip embedded QA blocks (markdown and raw HTML) from body; QA is represented by artifacts only. */
export function stripQAInformationBlockFromBody(bodyMd: string): string {
  if (!bodyMd || !bodyMd.trim()) return bodyMd
  const lines = bodyMd.split('\n')
  const out: string[] = []
  let inQABlock = false
  let inQAHtmlBlock = false
  let htmlDepth = 0
  const qaDivOpen = /<div[^>]*class=["'][^"']*qa-(info-section|section|workflow-section)(?:\s[^"']*)?["'][^>]*>/i
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    if (inQAHtmlBlock) {
      const opens = (line.match(/<div[^>]*>/gi) || []).length
      const closes = (line.match(/<\/div\s*>/gi) || []).length
      htmlDepth += opens - closes
      if (htmlDepth <= 0) inQAHtmlBlock = false
      continue
    }
    if (qaDivOpen.test(line)) {
      inQAHtmlBlock = true
      htmlDepth = 1
      const closes = (line.match(/<\/div\s*>/gi) || []).length
      htmlDepth -= closes
      if (htmlDepth <= 0) inQAHtmlBlock = false
      continue
    }
    const looksLikeQAHeading =
      /^#{1,6}\s*QA\b/i.test(trimmed) ||
      /\*\*QA\s+Information\*\*/i.test(trimmed) ||
      /^<h[1-6][^>]*>[\s\S]*QA\s+Information[\s\S]*<\/h[1-6]>/i.test(trimmed) ||
      (/QA\s+Information/i.test(trimmed) && (trimmed.length < 50 || /^#?\s*\*?\*?/.test(trimmed)))
    const isOtherSectionHeading =
      /^#{1,6}\s/.test(trimmed) &&
      !/^#{1,6}\s*QA\b/i.test(trimmed) &&
      !/^#{1,6}\s*Implementation\s+artifacts\s*:?\s*$/i.test(trimmed)
    if (looksLikeQAHeading) {
      inQABlock = true
      continue
    }
    if (inQABlock) {
      if (isOtherSectionHeading) {
        inQABlock = false
        out.push(line)
      }
      continue
    }
    out.push(line)
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
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
