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
 * More lenient than hasSubstantiveContent to accept structured QA reports with
 * sections, tables, and lists while still rejecting placeholders.
 * 
 * QA reports typically have:
 * - Multiple sections (## Ticket & Deliverable, ## Code Review, ## Verdict, etc.)
 * - Tables with structured data
 * - Bullet points and checkmarks
 * - Lists of requirements/evidence
 * 
 * This function accepts such structured content as substantive even if it
 * doesn't have long prose paragraphs.
 */
export function hasSubstantiveQAContent(body_md: string, title: string): { valid: boolean; reason?: string } {
  if (!body_md || body_md.trim().length === 0) {
    return { valid: false, reason: 'Artifact body is empty. Artifacts must contain substantive content, not just a title.' }
  }

  // Check for common placeholder patterns first (strict check)
  // Note: QA reports always start with a heading, so we don't check for "just a heading"
  const placeholderPatterns = [
    // Body is only a single heading with nothing else (after trimming)
    /^#\s+[^\n]+\s*$/m,
    // Heading followed immediately by placeholder text
    /^#\s+[^\n]+\n+(TODO|TBD|placeholder|coming soon|not yet|to be determined)/i,
    // Starts with placeholder text
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

  // Count sections (## headings) - QA reports typically have multiple sections
  const sectionCount = (body_md.match(/^##\s+/gm) || []).length
  
  // Count table rows (markdown tables use | separators)
  const tableRowCount = (body_md.match(/^\|.+\|$/gm) || []).length
  
  // Count words in the body (more lenient than character count)
  // Remove only the main heading (# Title) but keep section headings and content
  const withoutMainHeading = body_md.replace(/^#\s+[^\n]+\n*/m, '').trim()
  const words = withoutMainHeading.split(/\s+/).filter(word => word.length > 0)
  const wordCount = words.length

  // QA reports are valid if they have:
  // 1. Multiple sections (at least 2), OR
  // 2. At least one table with multiple rows (structured data), OR
  // 3. At least 50 words of content (even if mostly in lists/tables)
  
  if (sectionCount >= 2) {
    // Multiple sections indicate structured QA report
    return { valid: true }
  }
  
  if (tableRowCount >= 3) {
    // Tables with multiple rows indicate structured content
    return { valid: true }
  }
  
  if (wordCount >= 50) {
    // Sufficient word count indicates substantive content
    return { valid: true }
  }

  // If none of the above, check for minimum content
  // Remove markdown formatting but keep the text content
  const textOnly = body_md
    .replace(/^#{1,6}\s+/gm, '') // Remove heading markers but keep text
    .replace(/^\s*[-*+]\s+/gm, '') // Remove bullet markers but keep text
    .replace(/^\s*\d+\.\s+/gm, '') // Remove numbered list markers but keep text
    .replace(/\|/g, ' ') // Replace table separators with spaces
    .replace(/```[\s\S]*?```/g, '') // Remove code blocks
    .replace(/`[^`]+`/g, '') // Remove inline code
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // Replace links with link text
    .trim()

  const textWordCount = textOnly.split(/\s+/).filter(word => word.length > 0).length

  if (textWordCount < 20) {
    return {
      valid: false,
      reason: `Artifact body is too short (${textWordCount} words of substantive content). QA reports must contain at least 20 words of substantive content, or multiple structured sections/tables.`,
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
