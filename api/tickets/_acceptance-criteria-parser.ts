/**
 * Utility functions for parsing acceptance criteria from ticket body markdown.
 */

export interface AcceptanceCriteriaItem {
  index: number
  text: string
  checked: boolean
}

/**
 * Parses acceptance criteria items from ticket body markdown.
 * Looks for the "## Acceptance criteria" section and extracts checkbox items.
 * 
 * @param bodyMd - Ticket body markdown
 * @returns Array of AC items with index, text, and checked status
 */
export function parseAcceptanceCriteria(bodyMd: string | null): AcceptanceCriteriaItem[] {
  if (!bodyMd) return []

  // Match the Acceptance criteria section (case-insensitive, handles variations)
  const criteriaMatch = bodyMd.match(/##\s*Acceptance criteria[^\n]*\n([\s\S]*?)(?=\n##|$)/i)
  if (!criteriaMatch) return []

  const criteriaSection = criteriaMatch[1].trim()
  if (!criteriaSection) return []

  const items: AcceptanceCriteriaItem[] = []
  const lines = criteriaSection.split('\n')
  let index = 0

  for (const line of lines) {
    const trimmed = line.trim()
    
    // Match checkbox format: "- [ ]" or "- [x]" or "* [ ]" etc.
    const checkboxMatch = trimmed.match(/^[-*]\s+\[([ xX])\]\s+(.+)$/)
    if (checkboxMatch) {
      const checked = checkboxMatch[1].toLowerCase() === 'x'
      const text = checkboxMatch[2].trim()
      if (text) {
        items.push({
          index,
          text,
          checked,
        })
        index++
      }
    }
  }

  return items
}

/**
 * Gets the count of acceptance criteria items for a ticket.
 */
export function getAcceptanceCriteriaCount(bodyMd: string | null): number {
  return parseAcceptanceCriteria(bodyMd).length
}

/**
 * Checks if a ticket has any acceptance criteria.
 */
export function hasAcceptanceCriteria(bodyMd: string | null): boolean {
  return getAcceptanceCriteriaCount(bodyMd) > 0
}
