/**
 * Unit tests for canonical title creation and artifact type extraction.
 * Tests the shared logic extracted from insert-implementation.ts and insert-qa.ts.
 */

import { describe, it, expect } from 'vitest'
import {
  extractArtifactTypeFromTitle,
  createCanonicalTitle,
  normalizeTicketId,
} from './_shared.js'

describe('extractArtifactTypeFromTitle', () => {
  it('extracts "plan" from title', () => {
    expect(extractArtifactTypeFromTitle('Plan for ticket 0121')).toBe('plan')
    expect(extractArtifactTypeFromTitle('Plan for ticket HAL-0121')).toBe('plan')
  })

  it('extracts "worklog" from title', () => {
    expect(extractArtifactTypeFromTitle('Worklog for ticket 0121')).toBe('worklog')
  })

  it('extracts "changed-files" from title', () => {
    expect(extractArtifactTypeFromTitle('Changed Files for ticket 0121')).toBe('changed-files')
  })

  it('extracts "decisions" from title', () => {
    expect(extractArtifactTypeFromTitle('Decisions for ticket 0121')).toBe('decisions')
  })

  it('extracts "verification" from title', () => {
    expect(extractArtifactTypeFromTitle('Verification for ticket 0121')).toBe('verification')
  })

  it('extracts "pm-review" from title', () => {
    expect(extractArtifactTypeFromTitle('PM Review for ticket 0121')).toBe('pm-review')
  })

  it('extracts "qa-report" from title', () => {
    expect(extractArtifactTypeFromTitle('QA report for ticket 0121')).toBe('qa-report')
  })

  it('extracts "git-diff" from title', () => {
    expect(extractArtifactTypeFromTitle('Git diff for ticket 0121')).toBe('git-diff')
    expect(extractArtifactTypeFromTitle('Git-diff for ticket 0121')).toBe('git-diff')
  })

  it('extracts "instructions-used" from title', () => {
    expect(extractArtifactTypeFromTitle('Instructions Used for ticket 0121')).toBe('instructions-used')
  })

  it('extracts "implementation-agent-note" from title', () => {
    expect(extractArtifactTypeFromTitle('Implementation agent note for ticket 0121')).toBe('implementation-agent-note')
    expect(extractArtifactTypeFromTitle('Note for implementation agent: HAL-0121')).toBe('implementation-agent-note')
  })

  it('extracts "missing-artifact-explanation" from title', () => {
    expect(extractArtifactTypeFromTitle('Missing Artifact Explanation')).toBe('missing-artifact-explanation')
    expect(extractArtifactTypeFromTitle('Missing artifact explanation for ticket 0121')).toBe('missing-artifact-explanation')
  })

  it('returns null for unrecognized titles', () => {
    expect(extractArtifactTypeFromTitle('Random Title')).toBe(null)
    expect(extractArtifactTypeFromTitle('')).toBe(null)
  })

  it('handles case-insensitive matching', () => {
    expect(extractArtifactTypeFromTitle('PLAN FOR TICKET 0121')).toBe('plan')
    expect(extractArtifactTypeFromTitle('plan for ticket 0121')).toBe('plan')
    expect(extractArtifactTypeFromTitle('Plan For Ticket 0121')).toBe('plan')
  })
})

describe('createCanonicalTitle', () => {
  it('creates canonical title for "plan"', () => {
    expect(createCanonicalTitle('plan', '0121')).toBe('Plan for ticket 0121')
    expect(createCanonicalTitle('plan', 'HAL-0121')).toBe('Plan for ticket HAL-0121')
  })

  it('creates canonical title for "worklog"', () => {
    expect(createCanonicalTitle('worklog', '0121')).toBe('Worklog for ticket 0121')
  })

  it('creates canonical title for "changed-files"', () => {
    expect(createCanonicalTitle('changed-files', '0121')).toBe('Changed Files for ticket 0121')
  })

  it('creates canonical title for "decisions"', () => {
    expect(createCanonicalTitle('decisions', '0121')).toBe('Decisions for ticket 0121')
  })

  it('creates canonical title for "verification"', () => {
    expect(createCanonicalTitle('verification', '0121')).toBe('Verification for ticket 0121')
  })

  it('creates canonical title for "pm-review"', () => {
    expect(createCanonicalTitle('pm-review', '0121')).toBe('PM Review for ticket 0121')
  })

  it('creates canonical title for "qa-report"', () => {
    expect(createCanonicalTitle('qa-report', '0121')).toBe('QA report for ticket 0121')
  })

  it('creates canonical title for "git-diff"', () => {
    expect(createCanonicalTitle('git-diff', '0121')).toBe('Git diff for ticket 0121')
  })

  it('creates canonical title for "instructions-used"', () => {
    expect(createCanonicalTitle('instructions-used', '0121')).toBe('Instructions Used for ticket 0121')
  })

  it('creates canonical title for "implementation-agent-note"', () => {
    expect(createCanonicalTitle('implementation-agent-note', '0121')).toBe('Implementation agent note for ticket 0121')
  })

  it('creates fixed title for "missing-artifact-explanation"', () => {
    expect(createCanonicalTitle('missing-artifact-explanation', '0121')).toBe('Missing Artifact Explanation')
    expect(createCanonicalTitle('missing-artifact-explanation', 'HAL-0121')).toBe('Missing Artifact Explanation')
  })

  it('creates fallback title for unknown artifact types', () => {
    expect(createCanonicalTitle('unknown-type', '0121')).toBe('Artifact for ticket 0121')
  })

  it('handles empty display_id', () => {
    expect(createCanonicalTitle('plan', '')).toBe('Plan for ticket ')
  })
})

describe('normalizeTicketId', () => {
  it('removes "HAL-" prefix', () => {
    expect(normalizeTicketId('HAL-0121')).toBe('0121')
    expect(normalizeTicketId('HAL-121')).toBe('0121')
  })

  it('zero-pads numeric IDs to 4 digits', () => {
    expect(normalizeTicketId('121')).toBe('0121')
    expect(normalizeTicketId('1')).toBe('0001')
    expect(normalizeTicketId('12345')).toBe('12345')
  })

  it('preserves already-normalized IDs', () => {
    expect(normalizeTicketId('0121')).toBe('0121')
  })

  it('handles IDs without numeric parts', () => {
    expect(normalizeTicketId('ABC')).toBe('ABC')
    // normalizeTicketId returns the original ticketId if no numeric part is found
    expect(normalizeTicketId('HAL-ABC')).toBe('HAL-ABC')
  })
})
