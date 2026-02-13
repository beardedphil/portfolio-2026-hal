/**
 * Shared validation logic for artifact content (0121).
 * Used by all artifact insertion endpoints to ensure consistent duplicate detection.
 */

/**
 * Validates that body_md contains substantive content beyond just a title/heading.
 * Returns true if the content is valid, false if it's essentially empty/placeholder-only.
 */
export function hasSubstantiveContent(body_md: string, title: string): { valid: boolean; reason?: string } {
  if (!body_md || body_md.trim().length === 0) {
    return { valid: false, reason: 'Artifact body is empty. Artifacts must contain substantive content, not just a title.' }
  }

  // Remove markdown headings and check remaining content
  const withoutHeadings = body_md
    .replace(/^#{1,6}\s+.*$/gm, '') // Remove markdown headings
    .replace(/^[-*+]\s+.*$/gm, '') // Remove bullet points (might be just placeholder bullets)
    .replace(/^\d+\.\s+.*$/gm, '') // Remove numbered lists
    .trim()

  // If after removing headings and lists, there's no content, it's invalid
  if (withoutHeadings.length === 0) {
    return {
      valid: false,
      reason: 'Artifact body contains only headings or placeholder structure. Artifacts must include substantive content beyond the title.',
    }
  }

  // Check if content is just the title repeated or very short
  const normalizedTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '')
  const normalizedBody = body_md.toLowerCase().replace(/[^a-z0-9]/g, '')
  
  // If body is essentially just the title, it's invalid
  if (normalizedBody.length < 50 && normalizedBody.includes(normalizedTitle)) {
    return {
      valid: false,
      reason: 'Artifact body is too short or only contains the title. Artifacts must include detailed content (at least 50 characters of substantive text).',
    }
  }

  // Check for common placeholder patterns
  const placeholderPatterns = [
    /^#\s+[^\n]+\n*$/m, // Just a single heading
    /^#\s+[^\n]+\n+(TODO|TBD|placeholder|coming soon|not yet|to be determined)/i,
    /^(TODO|TBD|placeholder|coming soon|not yet|to be determined)/i,
  ]

  for (const pattern of placeholderPatterns) {
    if (pattern.test(body_md)) {
      return {
        valid: false,
        reason: 'Artifact body appears to contain only placeholder text. Artifacts must include actual implementation details, not placeholders.',
      }
    }
  }

  // Minimum length check (after removing headings)
  if (withoutHeadings.length < 30) {
    return {
      valid: false,
      reason: `Artifact body is too short (${withoutHeadings.length} characters after removing headings). Artifacts must contain at least 30 characters of substantive content.`,
    }
  }

  return { valid: true }
}

/**
 * Validates that body_md contains substantive content for QA reports.
 * Simple check: is the report significantly larger than a basic template?
 * 
 * A basic QA report template might be:
 * - Title heading
 * - A few section headings
 * - Minimal placeholder text
 * 
 * We check if the actual content is substantially larger than this.
 */
export function hasSubstantiveQAContent(body_md: string, title: string): { valid: boolean; reason?: string } {
  if (!body_md || body_md.trim().length === 0) {
    return { valid: false, reason: 'Artifact body is empty. Artifacts must contain substantive content, not just a title.' }
  }

  // Check for obvious placeholder patterns
  const placeholderPatterns = [
    /^(TODO|TBD|placeholder|coming soon|not yet|to be determined)/i,
  ]

  for (const pattern of placeholderPatterns) {
    if (pattern.test(body_md.trim())) {
      return {
        valid: false,
        reason: 'Artifact body appears to contain only placeholder text. Artifacts must include actual QA report content, not placeholders.',
      }
    }
  }

  // Simple check: count total characters (excluding just whitespace)
  // A basic template would be ~200-300 chars. We want significantly more.
  const trimmedLength = body_md.trim().length

  if (trimmedLength < 300) {
    return {
      valid: false,
      reason: `Artifact body is too short (${trimmedLength} characters). QA reports must contain substantially more content than a basic template (at least 300 characters).`,
    }
  }

  return { valid: true }
}

/**
 * Checks if an artifact body is empty or placeholder (simpler check for cleanup).
 * Used to identify artifacts that should be deleted during duplicate cleanup.
 */
export function isEmptyOrPlaceholder(body_md: string | null | undefined, title: string): boolean {
  if (!body_md || body_md.trim().length === 0) {
    return true
  }
  const validation = hasSubstantiveContent(body_md, title)
  return !validation.valid
}
