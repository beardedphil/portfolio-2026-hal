/**
 * Shared validation logic for artifact content (0121).
 * Used by all artifact insertion endpoints to ensure consistent duplicate detection.
 */

/**
 * Validates that body_md contains substantive content beyond just a title/heading.
 * Returns true if the content is valid, false if it's essentially empty/placeholder-only.
 * Checks for empty content, minimum length, and placeholder patterns.
 * 
 * Made more lenient (0197): Reduced minimum length from 50 to 30 characters to accept
 * shorter but still substantive content (e.g., brief code snippets, short lists).
 */
export function hasSubstantiveContent(body_md: string, title: string): { valid: boolean; reason?: string } {
  if (!body_md || body_md.trim().length === 0) {
    return { valid: false, reason: 'Artifact body is empty. Artifacts must contain substantive content, not just a title.' }
  }

  // Reduced minimum length check - at least 30 characters total (was 50)
  // This allows shorter but still substantive content like brief code snippets or short lists
  const trimmedLength = body_md.trim().length
  if (trimmedLength < 30) {
    return {
      valid: false,
      reason: `Artifact body is too short (${trimmedLength} characters). Artifacts must contain at least 30 characters of substantive content.`,
    }
  }

  // Check for placeholder patterns (including common placeholders like "(No files changed in this PR)", "(none)", etc.)
  // Made more lenient: only check if the ENTIRE body matches a placeholder pattern
  const trimmed = body_md.trim()
  const strictPlaceholderPatterns = [
    /^(TODO|TBD|placeholder|coming soon)$/i, // Only if entire body is just this
  ]

  for (const pattern of strictPlaceholderPatterns) {
    if (pattern.test(trimmed)) {
      return {
        valid: false,
        reason: 'Artifact body appears to contain only placeholder text. Artifacts must include actual content.',
      }
    }
  }

  // Check for obvious placeholder patterns that indicate empty content
  // Only reject if the pattern appears and there's very little other content
  const placeholderPatterns = [
    /\(No files changed in this PR\)/i,
    /\(none\)/i,
    /^##\s+[^\n]+\n+\n*\(No files changed/i,
    /^##\s+[^\n]+\n+\n*\(none\)/i,
  ]

  for (const pattern of placeholderPatterns) {
    if (pattern.test(trimmed)) {
      // Only reject if the placeholder is the majority of the content
      // Allow placeholders if there's substantial other content
      const withoutPlaceholder = trimmed.replace(pattern, '').trim()
      if (withoutPlaceholder.length < 20) {
        return {
          valid: false,
          reason: 'Artifact body appears to contain only placeholder text. Artifacts must include actual content.',
        }
      }
    }
  }

  // Check for headings with no content after them (more precise check)
  // Only flag if the heading is followed by end of string or only whitespace/newlines
  const headingOnlyPatterns = [
    /^##\s+Modified\s*$/m, // Just "## Modified" with no content after
    /^##\s+Changed Files\s*$/m, // Just "## Changed Files" with no content after
  ]
  for (const pattern of headingOnlyPatterns) {
    // Check if pattern matches AND there's no substantial content after the heading
    const match = trimmed.match(pattern)
    if (match) {
      const afterMatch = trimmed.substring(match.index! + match[0].length).trim()
      // Only reject if there's less than 20 characters of actual content after the heading
      if (afterMatch.length < 20) {
        return {
          valid: false,
          reason: 'Artifact body appears to contain only placeholder text. Artifacts must include actual content.',
        }
      }
    }
  }

  // For "Changed Files" artifacts, check that there's actual file content (not just headings)
  // Made more lenient: reduced minimum from 30 to 20 characters
  if (title.toLowerCase().includes('changed files')) {
    const withoutHeadings = trimmed.replace(/^#{1,6}\s+.*$/gm, '').trim()
    if (withoutHeadings.length < 20 || /^(\(none\)|\(No files changed)/i.test(withoutHeadings)) {
      return {
        valid: false,
        reason: 'Changed Files artifact must list actual file changes, not placeholder text.',
      }
    }
  }

  // For "Verification" artifacts, check that there's actual verification content (not just checkboxes)
  // Made more lenient: reduced minimum from 30 to 20 characters
  if (title.toLowerCase().includes('verification')) {
    const withoutCheckboxes = trimmed.replace(/^[-*+]\s+\[[ x]\]\s+.*$/gm, '').replace(/^#{1,6}\s+.*$/gm, '').trim()
    if (withoutCheckboxes.length < 20 || /^(\(none\)|Changed Files \(none\))/i.test(withoutCheckboxes)) {
      return {
        valid: false,
        reason: 'Verification artifact must contain actual verification steps and notes, not placeholder text.',
      }
    }
  }

  return { valid: true }
}

/**
 * Validates that body_md contains substantive content for QA reports.
 * Simplified validation: just check for empty and obvious placeholders.
 * 
 * Made more lenient (0197): Reduced minimum length from 100 to 50 characters to accept
 * shorter but still substantive QA reports (e.g., brief pass/fail reports with tables).
 */
export function hasSubstantiveQAContent(body_md: string, title: string): { valid: boolean; reason?: string } {
  if (!body_md || body_md.trim().length === 0) {
    return { valid: false, reason: 'Artifact body is empty. Artifacts must contain substantive content, not just a title.' }
  }

  // Reduced minimum length check - at least 50 characters for QA reports (was 100)
  // This allows shorter but still substantive QA reports with tables, checklists, etc.
  const trimmedLength = body_md.trim().length
  if (trimmedLength < 50) {
    return {
      valid: false,
      reason: `Artifact body is too short (${trimmedLength} characters). QA reports must contain at least 50 characters of substantive content.`,
    }
  }

  // Only check for obvious placeholder patterns at the very start
  // Only reject if the ENTIRE body is just a placeholder
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
