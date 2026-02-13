/**
 * Shared validation logic for artifact content (0121).
 * Used by all artifact insertion endpoints to ensure consistent duplicate detection.
 */

/**
 * Validates that body_md contains substantive content beyond just a title/heading.
 * Returns true if the content is valid, false if it's essentially empty/placeholder-only.
 * Simplified validation: just check for empty and obvious placeholders.
 */
export function hasSubstantiveContent(body_md: string, title: string): { valid: boolean; reason?: string } {
  if (!body_md || body_md.trim().length === 0) {
    return { valid: false, reason: 'Artifact body is empty. Artifacts must contain substantive content, not just a title.' }
  }

  // Simple minimum length check - at least 50 characters total
  if (body_md.trim().length < 50) {
    return {
      valid: false,
      reason: `Artifact body is too short (${body_md.trim().length} characters). Artifacts must contain at least 50 characters.`,
    }
  }

  // Check for obvious placeholder patterns at the very start
  const trimmed = body_md.trim()
  if (/^(TODO|TBD|placeholder|coming soon)$/i.test(trimmed)) {
    return {
      valid: false,
      reason: 'Artifact body appears to contain only placeholder text. Artifacts must include actual content.',
    }
  }

  // Check for common placeholder patterns in content (e.g., "(No files changed in this PR)", "(none)")
  const placeholderPatterns = [
    /\(No files changed/i,
    /\(none\)/i,
    /^##\s+Modified\s*\n\s*\(No files changed/i,
    /Changed Files \(none\)/i,
  ]
  for (const pattern of placeholderPatterns) {
    if (pattern.test(body_md)) {
      return {
        valid: false,
        reason: 'Artifact body contains placeholder text indicating missing data. Artifacts must include actual content.',
      }
    }
  }

  return { valid: true }
}

/**
 * Validates that body_md contains substantive content for QA reports.
 * Simplified validation: just check for empty and obvious placeholders.
 */
export function hasSubstantiveQAContent(body_md: string, title: string): { valid: boolean; reason?: string } {
  if (!body_md || body_md.trim().length === 0) {
    return { valid: false, reason: 'Artifact body is empty. Artifacts must contain substantive content, not just a title.' }
  }

  // Simple minimum length check - at least 100 characters for QA reports
  const trimmedLength = body_md.trim().length
  if (trimmedLength < 100) {
    return {
      valid: false,
      reason: `Artifact body is too short (${trimmedLength} characters). QA reports must contain at least 100 characters.`,
    }
  }

  // Only check for obvious placeholder patterns at the very start
  const trimmed = body_md.trim()
  if (/^(TODO|TBD|placeholder|coming soon)$/i.test(trimmed)) {
    return {
      valid: false,
      reason: 'Artifact body appears to contain only placeholder text. Artifacts must include actual QA report content.',
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
