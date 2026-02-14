/**
 * Shared peer review logic for ticket Definition of Ready checks.
 * Used by both the API endpoint and PM agent.
 */

/**
 * Extract section body after a ## Section Title line (first line after blank line or next ##).
 */
function sectionContent(body: string, sectionTitle: string): string {
  const escapedTitle = sectionTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(
    `##\\s+${escapedTitle}\\s*\\n([\\s\\S]*?)(?=\\n##\\s*[^\\s#\\n]|$)`
  )
  const m = body.match(re)
  return (m?.[1] ?? '').trim()
}

/** Placeholder-like pattern: angle brackets with content (e.g. <AC 1>, <task-id>). */
const PLACEHOLDER_RE = /<[A-Za-z0-9\s\-_]+>/g

export interface PeerReviewResult {
  pass: boolean
  issues: Array<{
    type: 'missing-section' | 'invalid-heading' | 'invalid-acceptance-criteria' | 'placeholder' | 'other'
    message: string
    section?: string
    line?: number
  }>
  checklistResults: {
    goal: boolean
    deliverable: boolean
    acceptanceCriteria: boolean
    constraintsNonGoals: boolean
    noPlaceholders: boolean
    properHeadings: boolean
  }
}

/**
 * Perform peer review (Definition of Ready check) on a ticket body.
 * Returns detailed PASS/FAIL result with specific issues.
 */
export function performPeerReview(bodyMd: string): PeerReviewResult {
  const body = bodyMd.trim()
  const issues: PeerReviewResult['issues'] = []
  const checklistResults: PeerReviewResult['checklistResults'] = {
    goal: false,
    deliverable: false,
    acceptanceCriteria: false,
    constraintsNonGoals: false,
    noPlaceholders: true,
    properHeadings: true,
  }

  // Required section headings (exact match, case-sensitive)
  const REQUIRED_SECTIONS = [
    { heading: '## Goal (one sentence)', name: 'Goal' },
    { heading: '## Human-verifiable deliverable (UI-only)', name: 'Human-verifiable deliverable' },
    { heading: '## Acceptance criteria (UI-only)', name: 'Acceptance criteria' },
  ]

  // Optional but recommended sections
  const OPTIONAL_SECTIONS = [
    { heading: '## Constraints', name: 'Constraints' },
    { heading: '## Non-goals', name: 'Non-goals' },
  ]

  // Check for required sections
  for (const section of REQUIRED_SECTIONS) {
    const content = sectionContent(body, section.heading)
    if (!content || content.length < 10) {
      issues.push({
        type: 'missing-section',
        message: `Missing or empty "${section.name}" section. Required heading: "${section.heading}"`,
        section: section.name,
      })
    } else {
      if (section.name === 'Goal') {
        checklistResults.goal = true
      } else if (section.name === 'Human-verifiable deliverable') {
        checklistResults.deliverable = true
      }
    }
  }

  // Check Acceptance criteria format (must use checkboxes - [ ])
  const acceptanceCriteriaContent = sectionContent(body, '## Acceptance criteria (UI-only)')
  if (acceptanceCriteriaContent) {
    const lines = acceptanceCriteriaContent.split('\n')
    const hasCheckboxes = lines.some((line) => /^[-*]\s+\[[\sx]\]/.test(line.trim()))
    const hasPlainBullets = lines.some((line) => {
      const trimmed = line.trim()
      return /^[-*]\s+[^[\s]/.test(trimmed) && !trimmed.startsWith('- [')
    })

    if (hasPlainBullets && !hasCheckboxes) {
      issues.push({
        type: 'invalid-acceptance-criteria',
        message: 'Acceptance criteria must use checkbox format (- [ ]), not plain bullets (-)',
        section: 'Acceptance criteria',
      })
    } else if (hasCheckboxes) {
      checklistResults.acceptanceCriteria = true
    }
  }

  // Check for placeholders
  const placeholders = body.match(PLACEHOLDER_RE) ?? []
  if (placeholders.length > 0) {
    const uniquePlaceholders = [...new Set(placeholders)]
    issues.push({
      type: 'placeholder',
      message: `Unresolved placeholders found: ${uniquePlaceholders.join(', ')}`,
    })
    checklistResults.noPlaceholders = false
  }

  // Check for proper heading levels (must use ## not # or ###)
  const headingLines = body.split('\n').map((line, idx) => ({ line, idx: idx + 1 }))
  for (const { line, idx } of headingLines) {
    const trimmed = line.trim()
    // Check for H1 (#) or H3+ (###+) when H2 (##) is required
    if (/^#\s+[^#]/.test(trimmed) && !trimmed.startsWith('##')) {
      issues.push({
        type: 'invalid-heading',
        message: `Line ${idx}: Use ## (H2) for section headings, not # (H1). Found: "${trimmed.substring(0, 50)}"`,
        line: idx,
      })
      checklistResults.properHeadings = false
    } else if (/^#{3,}\s+/.test(trimmed)) {
      // Check if it's a required section that should be H2
      const headingText = trimmed.replace(/^#+\s+/, '')
      const isRequiredSection = REQUIRED_SECTIONS.some(
        (s) => s.heading.replace(/^##\s+/, '') === headingText
      )
      if (isRequiredSection) {
        issues.push({
          type: 'invalid-heading',
          message: `Line ${idx}: Required section "${headingText}" must use ## (H2), not ${trimmed.match(/^#+/)?.[0] || 'H3+'}. Found: "${trimmed.substring(0, 50)}"`,
          line: idx,
          section: headingText,
        })
        checklistResults.properHeadings = false
      }
    }
  }

  // Check for pseudo-headings (bold text instead of markdown headings)
  for (const section of REQUIRED_SECTIONS) {
    const sectionName = section.heading.replace(/^##\s+/, '')
    // Look for bold pseudo-headings like **Goal (one sentence):** or Goal (one sentence):
    const pseudoHeadingPatterns = [
      new RegExp(`\\*\\*${sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\*\\*:?`, 'i'),
      new RegExp(`^${sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:?`, 'i'),
    ]
    for (const pattern of pseudoHeadingPatterns) {
      if (pattern.test(body) && !body.includes(section.heading)) {
        issues.push({
          type: 'invalid-heading',
          message: `Found pseudo-heading for "${sectionName}" (bold text or plain text with colon). Use proper markdown heading: "${section.heading}"`,
          section: sectionName,
        })
        checklistResults.properHeadings = false
        break
      }
    }
  }

  // Check Constraints and Non-goals (optional but recommended)
  for (const section of OPTIONAL_SECTIONS) {
    const content = sectionContent(body, section.heading)
    if (content && content.length >= 10) {
      if (section.name === 'Constraints' || section.name === 'Non-goals') {
        checklistResults.constraintsNonGoals = true
      }
    }
  }

  // Overall pass/fail
  const pass =
    checklistResults.goal &&
    checklistResults.deliverable &&
    checklistResults.acceptanceCriteria &&
    checklistResults.noPlaceholders &&
    checklistResults.properHeadings &&
    issues.length === 0

  return {
    pass,
    issues,
    checklistResults,
  }
}
