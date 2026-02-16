/**
 * Pure helper functions extracted from projectManager.ts to improve simplicity and testability.
 * These utilities are used for ticket processing, parsing, and readiness evaluation.
 */

/** Placeholder-like pattern: angle brackets with content (e.g. <AC 1>, <task-id>). */
export const PLACEHOLDER_RE = /<[A-Za-z0-9\s\-_]+>/g

/**
 * Slug for ticket filename: lowercase, spaces to hyphens, strip non-alphanumeric except hyphen.
 * Returns a URL-safe slug from a title string.
 */
export function slugFromTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'ticket'
}

/**
 * Generate a repository hint prefix from a repository full name.
 * Extracts a short uppercase identifier (2-6 characters) from the repository name.
 * Falls back to first 4 letters or 'PRJ' if no suitable token is found.
 */
export function repoHintPrefix(repoFullName: string): string {
  const repo = repoFullName.split('/').pop() ?? repoFullName
  const tokens = repo
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter(Boolean)

  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i]
    if (!/[a-z]/.test(t)) continue
    if (t.length >= 2 && t.length <= 6) return t.toUpperCase()
  }

  const letters = repo.replace(/[^a-zA-Z]/g, '').toUpperCase()
  return (letters.slice(0, 4) || 'PRJ').toUpperCase()
}

/**
 * Parse a ticket number from a reference string.
 * Extracts the last 1-4 digit sequence from the string.
 * Returns null if no valid number is found.
 */
export function parseTicketNumber(ref: string): number | null {
  const s = String(ref ?? '').trim()
  if (!s) return null
  const m = s.match(/(\d{1,4})(?!.*\d)/) // last 1-4 digit run
  if (!m) return null
  const n = parseInt(m[1], 10)
  return Number.isFinite(n) ? n : null
}

export interface ReadyCheckResult {
  ready: boolean
  missingItems: string[]
  checklistResults: {
    goal: boolean
    deliverable: boolean
    acceptanceCriteria: boolean
    constraintsNonGoals: boolean
    noPlaceholders: boolean
  }
}

/**
 * Evaluate ticket body against the Ready-to-start checklist (Definition of Ready).
 * Simplified check: ticket has content beyond the template (is bigger than template).
 * 
 * The template is approximately 1500-2000 characters. A ticket is ready if:
 * - It has substantial content (longer than template baseline)
 * - It's not just template placeholders
 */
export function evaluateTicketReady(bodyMd: string): ReadyCheckResult {
  const body = bodyMd.trim()
  
  // Template baseline: approximately 1500-2000 chars for a filled template
  // A ticket with actual content should be substantially larger
  const TEMPLATE_BASELINE = 1500
  const hasSubstantialContent = body.length > TEMPLATE_BASELINE
  
  // Check if it's mostly placeholders (simple heuristic: if >50% of content is placeholders, it's not ready)
  const placeholders = body.match(PLACEHOLDER_RE) ?? []
  const placeholderChars = placeholders.join('').length
  const isMostlyPlaceholders = placeholderChars > body.length * 0.5

  const ready = hasSubstantialContent && !isMostlyPlaceholders
  const missingItems: string[] = []
  
  if (!ready) {
    if (!hasSubstantialContent) {
      missingItems.push('Ticket content is too short (needs more content beyond template)')
    }
    if (isMostlyPlaceholders) {
      missingItems.push('Ticket contains too many unresolved placeholders')
    }
  }

  return {
    ready,
    missingItems,
    checklistResults: {
      goal: hasSubstantialContent,
      deliverable: hasSubstantialContent,
      acceptanceCriteria: hasSubstantialContent,
      constraintsNonGoals: hasSubstantialContent,
      noPlaceholders: !isMostlyPlaceholders,
    },
  }
}
