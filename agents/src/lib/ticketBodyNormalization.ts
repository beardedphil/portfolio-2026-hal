/**
 * Shared helpers for normalizing and parsing ticket body markdown.
 * Extracted from projectManager.ts to reduce duplication and monolith risk.
 */

/** Normalize body so Ready-to-start evaluator finds sections: ## and exact titles (LLMs often output # or shortened titles). */
export function normalizeBodyForReady(bodyMd: string): string {
  let out = bodyMd.trim()
  const replacements: [RegExp, string][] = [
    [/^# Goal\s*$/gm, '## Goal (one sentence)'],
    [/^# Human-verifiable deliverable\s*$/gm, '## Human-verifiable deliverable (UI-only)'],
    [/^# Acceptance criteria\s*$/gm, '## Acceptance criteria (UI-only)'],
    [/^# Constraints\s*$/gm, '## Constraints'],
    [/^# Non-goals\s*$/gm, '## Non-goals'],
  ]
  for (const [re, replacement] of replacements) {
    out = out.replace(re, replacement)
  }
  return out
}

/** Extract section body after a ## Section Title line (first line after blank line or next ##). */
export function sectionContent(body: string, sectionTitle: string): string {
  // Escape special regex characters in the section title
  const escapedTitle = sectionTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Find the section heading
  const headingPattern = new RegExp(`^##\\s+${escapedTitle}\\s*$`, 'm')
  const headingMatch = body.match(headingPattern)
  if (!headingMatch) return ''
  
  // Find the position after the heading line (including its newline)
  const headingEnd = headingMatch.index! + headingMatch[0].length
  const afterHeading = body.slice(headingEnd)
  
  // Find the next ## heading (must be at start of line, so look for \n##)
  const nextHeadingMatch = afterHeading.match(/\n##/m)
  if (nextHeadingMatch) {
    // Return content up to the newline before the next heading
    return afterHeading.slice(0, nextHeadingMatch.index).trim()
  }
  
  // No next heading, return all content after this heading
  return afterHeading.trim()
}

/** Normalize Title line in body_md to include ID prefix: "<ID> — <title>". Returns normalized body_md. */
export function normalizeTitleLineInBody(bodyMd: string, ticketId: string): string {
  if (!bodyMd || !ticketId) return bodyMd
  const idPrefix = `${ticketId} — `
  // Match the Title line: "- **Title**: ..."
  const titleLineRegex = /(- \*\*Title\*\*:\s*)(.+?)(?:\n|$)/
  const match = bodyMd.match(titleLineRegex)
  if (!match) return bodyMd // No Title line found, return as-is
  
  const prefix = match[1] // "- **Title**: "
  let titleValue = match[2].trim()
  
  // Remove any existing ID prefix (e.g. "0048 — " or "HAL-0048 - ")
  titleValue = titleValue.replace(/^(?:[A-Za-z0-9]{2,10}-)?\d{4}\s*[—–-]\s*/, '')
  
  // Prepend the correct ID prefix
  const normalizedTitle = `${idPrefix}${titleValue}`
  const normalizedLine = `${prefix}${normalizedTitle}${match[0].endsWith('\n') ? '\n' : ''}`
  
  return bodyMd.replace(titleLineRegex, normalizedLine)
}
