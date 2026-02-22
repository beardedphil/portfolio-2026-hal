/**
 * Helper functions for artifact summary mode in get.ts.
 * Extracted to improve testability and maintainability.
 */

/**
 * Determines if an artifact body is blank or contains only placeholder content.
 * 
 * @param body_md - The markdown body of the artifact
 * @param title - The title of the artifact (currently unused but kept for API compatibility)
 * @returns true if the artifact is considered blank
 */
export function isArtifactBlank(body_md: string | null | undefined, title: string): boolean {
  if (!body_md || body_md.trim().length === 0) {
    return true
  }

  const withoutHeadings = body_md
    .replace(/^#{1,6}\s+.*$/gm, '')
    .replace(/^[-*+]\s+.*$/gm, '')
    .replace(/^\d+\.\s+.*$/gm, '')
    .trim()

  if (withoutHeadings.length === 0 || withoutHeadings.length < 30) {
    return true
  }

  const placeholderPatterns = [
    /^#\s+[^\n]+\s*$/, // Entire body is just a heading (no multiline flag - matches entire string)
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
 * Extracts a snippet from artifact body_md for summary display.
 * Removes headings and returns up to 200 characters, breaking at word boundaries when possible.
 * 
 * @param body_md - The markdown body of the artifact
 * @returns A snippet string (empty if body_md is empty or only contains headings)
 */
export function extractSnippet(body_md: string | null | undefined): string {
  if (!body_md) {
    return ''
  }

  const withoutHeadings = body_md.replace(/^#{1,6}\s+.*$/gm, '').trim()
  if (withoutHeadings.length === 0) {
    return ''
  }

  const snippet = withoutHeadings.substring(0, 200)
  const lastSpace = snippet.lastIndexOf(' ')
  if (lastSpace > 150 && lastSpace < 200) {
    return snippet.substring(0, lastSpace) + '...'
  }

  return snippet.length < withoutHeadings.length ? snippet + '...' : snippet
}
