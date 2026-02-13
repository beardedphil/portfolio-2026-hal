/**
 * Shared validation logic for artifact content (0121).
 * Used by all artifact insertion endpoints to ensure consistent duplicate detection.
 */

/**
 * Validates that body_md contains substantive content beyond just a title/heading.
 * Returns true if the content is valid, false if it's essentially empty/placeholder-only.
 * Detects placeholder patterns like "(No files changed in this PR)", "(none)", etc.
 */
export function hasSubstantiveContent(body_md: string, title: string): { valid: boolean; reason?: string } {
  if (!body_md || body_md.trim().length === 0) {
    return { valid: false, reason: 'Artifact body is empty. Artifacts must contain substantive content, not just a title.' }
  }

  const trimmed = body_md.trim()

  // Check for obvious placeholder patterns at the very start
  if (/^(TODO|TBD|placeholder|coming soon)$/i.test(trimmed)) {
    return {
      valid: false,
      reason: 'Artifact body appears to contain only placeholder text. Artifacts must include actual content.',
    }
  }

  // Check for specific placeholder patterns found in generated artifacts
  const placeholderPatterns = [
    /\(No files changed in this PR\)/i,
    /^##\s+Modified\s*\n\s*\(No files changed in this PR\)$/im,
    /^##\s+Changed Files\s*\n\s*\(none\)$/im,
    /^\(none\)$/i,
    /^##\s+[^\n]+\s*\n\s*\(none\)$/im,
  ]

  for (const pattern of placeholderPatterns) {
    if (pattern.test(trimmed)) {
      return {
        valid: false,
        reason: 'Artifact body contains placeholder text indicating no data was available. Artifacts must include actual content.',
      }
    }
  }

  // Simple minimum length check - at least 50 characters total (after placeholder checks)
  if (trimmed.length < 50) {
    return {
      valid: false,
      reason: `Artifact body is too short (${trimmed.length} characters). Artifacts must contain at least 50 characters.`,
    }
  }

  return { valid: true }
}

/**
 * Validates that body_md contains substantive content for QA reports.
 * Detects placeholder patterns like "(No files changed in this PR)", "(none)", etc.
 */
export function hasSubstantiveQAContent(body_md: string, title: string): { valid: boolean; reason?: string } {
  if (!body_md || body_md.trim().length === 0) {
    return { valid: false, reason: 'Artifact body is empty. Artifacts must contain substantive content, not just a title.' }
  }

  const trimmed = body_md.trim()

  // Check for obvious placeholder patterns at the very start
  if (/^(TODO|TBD|placeholder|coming soon)$/i.test(trimmed)) {
    return {
      valid: false,
      reason: 'Artifact body appears to contain only placeholder text. Artifacts must include actual QA report content.',
    }
  }

  // Check for specific placeholder patterns found in generated artifacts
  const placeholderPatterns = [
    /\(No files changed in this PR\)/i,
    /^##\s+Modified\s*\n\s*\(No files changed in this PR\)$/im,
    /^##\s+Changed Files\s*\n\s*\(none\)$/im,
    /^\(none\)$/i,
    /^##\s+[^\n]+\s*\n\s*\(none\)$/im,
  ]

  for (const pattern of placeholderPatterns) {
    if (pattern.test(trimmed)) {
      return {
        valid: false,
        reason: 'Artifact body contains placeholder text indicating no data was available. QA reports must include actual content.',
      }
    }
  }

  // Simple minimum length check - at least 100 characters for QA reports (after placeholder checks)
  if (trimmed.length < 100) {
    return {
      valid: false,
      reason: `Artifact body is too short (${trimmed.length} characters). QA reports must contain at least 100 characters.`,
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
