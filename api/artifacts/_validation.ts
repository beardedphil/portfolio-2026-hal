/**
 * Shared validation logic for artifact content (0121).
 * Used by all artifact insertion endpoints to ensure consistent duplicate detection.
 */

/**
 * Validates that body_md contains substantive content beyond just a title/heading.
 * Returns true if the content is valid, false if it's essentially empty/placeholder-only.
 * Checks for empty content, minimum length, and placeholder patterns.
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

  // Check for placeholder patterns (including common placeholders like "(No files changed in this PR)", "(none)", etc.)
  const trimmed = body_md.trim()
  const placeholderPatterns = [
    /^(TODO|TBD|placeholder|coming soon)$/i,
    /\(No files changed in this PR\)/i,
    /\(none\)/i,
    /^##\s+[^\n]+\n+\n*\(No files changed/i,
    /^##\s+[^\n]+\n+\n*\(none\)/i,
  ]

  for (const pattern of placeholderPatterns) {
    if (pattern.test(trimmed)) {
      return {
        valid: false,
        reason: 'Artifact body appears to contain only placeholder text. Artifacts must include actual content.',
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
  if (title.toLowerCase().includes('changed files')) {
    const withoutHeadings = trimmed.replace(/^#{1,6}\s+.*$/gm, '').trim()
    // Accept explicit "No files changed." statements with a reason (must be at least 30 chars total)
    const noFilesChangedPattern = /^No files changed\./i
    if (noFilesChangedPattern.test(withoutHeadings)) {
      // If it says "No files changed.", require at least 30 characters total (including the reason)
      if (withoutHeadings.length < 30) {
        return {
          valid: false,
          reason: 'Changed Files artifact must include "No files changed." followed by a brief reason (e.g., "No files changed. Docs-only ticket handled via Supabase updates.").',
        }
      }
      // Valid "No files changed" statement with reason
    } else if (withoutHeadings.length < 30 || /^(\(none\)|\(No files changed)/i.test(withoutHeadings)) {
      // Reject placeholder patterns like "(none)" or "(No files changed" without the proper format
      return {
        valid: false,
        reason: 'Changed Files artifact must either list actual file changes OR explicitly state "No files changed." followed by a brief reason. Placeholder text like "(none)" is not acceptable.',
      }
    }
  }

  // For "Verification" artifacts, check that there's actual verification content (not just checkboxes)
  if (title.toLowerCase().includes('verification')) {
    const withoutCheckboxes = trimmed.replace(/^[-*+]\s+\[[ x]\]\s+.*$/gm, '').replace(/^#{1,6}\s+.*$/gm, '').trim()
    if (withoutCheckboxes.length < 30 || /^(\(none\)|Changed Files \(none\))/i.test(withoutCheckboxes)) {
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
