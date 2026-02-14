/**
 * Peer review / Definition of Ready checker for tickets.
 * Validates ticket formatting and required sections before tickets can be moved to To Do.
 */

export interface PeerReviewIssue {
  type: 'missing-section' | 'placeholder' | 'invalid-format' | 'missing-checkbox' | 'other'
  message: string
  section?: string // Section name (e.g., "Goal", "Acceptance criteria")
  lineNumber?: number // Approximate line number if available
}

export interface PeerReviewResult {
  pass: boolean
  issues: PeerReviewIssue[]
}

/**
 * Required ticket sections (H2 headings) that must be present.
 */
const REQUIRED_SECTIONS = [
  { heading: '## Goal (one sentence)', name: 'Goal (one sentence)' },
  { heading: '## Human-verifiable deliverable (UI-only)', name: 'Human-verifiable deliverable (UI-only)' },
  { heading: '## Acceptance criteria (UI-only)', name: 'Acceptance criteria (UI-only)' },
] as const

/**
 * Optional but recommended sections.
 */
const RECOMMENDED_SECTIONS = [
  { heading: '## Constraints', name: 'Constraints' },
  { heading: '## Non-goals', name: 'Non-goals' },
] as const

/**
 * Check if a heading exists in the markdown (case-sensitive, exact match).
 */
function hasHeading(markdown: string, heading: string): boolean {
  // Match the heading exactly (with optional trailing whitespace)
  const regex = new RegExp(`^${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm')
  return regex.test(markdown)
}

/**
 * Extract content under a heading (until next H2 heading or end of document).
 */
function getSectionContent(markdown: string, heading: string): string {
  const headingRegex = new RegExp(`^${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm')
  const match = markdown.match(headingRegex)
  if (!match || !match.index) return ''
  
  const startIndex = match.index + match[0].length
  const remaining = markdown.slice(startIndex)
  
  // Find next H2 heading (##) or end of document
  const nextH2Match = remaining.match(/^##\s+/m)
  if (nextH2Match && nextH2Match.index !== undefined) {
    return remaining.slice(0, nextH2Match.index).trim()
  }
  
  return remaining.trim()
}

/**
 * Check for unresolved placeholders (e.g., <...>, TODO, FIXME, etc.).
 */
function findPlaceholders(content: string): PeerReviewIssue[] {
  const issues: PeerReviewIssue[] = []
  
  // Common placeholder patterns
  const placeholderPatterns = [
    { pattern: /<[^>]+>/g, message: 'Unresolved placeholder' }, // <...>, <placeholder>
    { pattern: /\bTODO\b/gi, message: 'TODO marker found' },
    { pattern: /\bFIXME\b/gi, message: 'FIXME marker found' },
    { pattern: /\bXXX\b/gi, message: 'XXX marker found' },
    { pattern: /\[.*?\]/g, message: 'Bracket placeholder found' }, // [something]
  ]
  
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    for (const { pattern, message } of placeholderPatterns) {
      if (pattern.test(line)) {
        // Extract the placeholder text
        const matches = line.match(pattern)
        if (matches && matches.length > 0) {
          issues.push({
            type: 'placeholder',
            message: `${message}: "${matches[0]}"`,
            lineNumber: i + 1,
          })
        }
      }
    }
  }
  
  return issues
}

/**
 * Check if Acceptance criteria section uses checkbox format (- [ ]).
 */
function checkAcceptanceCriteriaFormat(content: string): PeerReviewIssue[] {
  const issues: PeerReviewIssue[] = []
  
  // Check if section exists
  if (!hasHeading(content, '## Acceptance criteria (UI-only)')) {
    return issues // Missing section is handled separately
  }
  
  const sectionContent = getSectionContent(content, '## Acceptance criteria (UI-only)')
  if (!sectionContent.trim()) {
    issues.push({
      type: 'invalid-format',
      message: 'Acceptance criteria section is empty',
      section: 'Acceptance criteria (UI-only)',
    })
    return issues
  }
  
  // Check for checkbox format (- [ ])
  const lines = sectionContent.split('\n')
  let hasCheckbox = false
  let hasPlainBullet = false
  
  for (const line of lines) {
    const trimmed = line.trim()
    // Check for checkbox format: - [ ] or - [x]
    if (/^-\s+\[[\sx]\]/.test(trimmed)) {
      hasCheckbox = true
    }
    // Check for plain bullet (without checkbox)
    if (/^-\s+[^[]/.test(trimmed) && !trimmed.includes('[ ]') && !trimmed.includes('[x]')) {
      hasPlainBullet = true
    }
  }
  
  if (hasPlainBullet && !hasCheckbox) {
    issues.push({
      type: 'missing-checkbox',
      message: 'Acceptance criteria must use checkbox format (- [ ]), not plain bullets (-)',
      section: 'Acceptance criteria (UI-only)',
    })
  } else if (!hasCheckbox && lines.some(line => line.trim().startsWith('-'))) {
    issues.push({
      type: 'missing-checkbox',
      message: 'Acceptance criteria items must use checkbox format (- [ ])',
      section: 'Acceptance criteria (UI-only)',
    })
  }
  
  return issues
}

/**
 * Perform peer review / Definition of Ready check on a ticket body.
 */
export function performPeerReview(bodyMd: string): PeerReviewResult {
  const issues: PeerReviewIssue[] = []
  
  if (!bodyMd || !bodyMd.trim()) {
    return {
      pass: false,
      issues: [
        {
          type: 'other',
          message: 'Ticket body is empty',
        },
      ],
    }
  }
  
  // Check for required sections
  for (const { heading, name } of REQUIRED_SECTIONS) {
    if (!hasHeading(bodyMd, heading)) {
      issues.push({
        type: 'missing-section',
        message: `Missing required section: "${name}"`,
        section: name,
      })
    }
  }
  
  // Check Acceptance criteria format (only if section exists)
  if (hasHeading(bodyMd, '## Acceptance criteria (UI-only)')) {
    const acIssues = checkAcceptanceCriteriaFormat(bodyMd)
    issues.push(...acIssues)
  }
  
  // Check for placeholders in the entire body
  const placeholderIssues = findPlaceholders(bodyMd)
  issues.push(...placeholderIssues)
  
  // Check that required sections have content
  for (const { heading, name } of REQUIRED_SECTIONS) {
    if (hasHeading(bodyMd, heading)) {
      const sectionContent = getSectionContent(bodyMd, heading)
      if (!sectionContent.trim()) {
        issues.push({
          type: 'invalid-format',
          message: `Section "${name}" exists but is empty`,
          section: name,
        })
      }
    }
  }
  
  return {
    pass: issues.length === 0,
    issues,
  }
}

/**
 * Format peer review result for display in UI.
 */
export function formatPeerReviewResult(result: PeerReviewResult): string {
  if (result.pass) {
    return '✅ **PASS** — Ticket meets Definition of Ready requirements.'
  }
  
  const issueList = result.issues
    .map((issue, idx) => {
      const lineInfo = issue.lineNumber ? ` (line ${issue.lineNumber})` : ''
      return `${idx + 1}. ${issue.message}${lineInfo}`
    })
    .join('\n')
  
  return `❌ **FAIL** — Found ${result.issues.length} issue(s):\n\n${issueList}`
}
