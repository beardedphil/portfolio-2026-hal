/**
 * Unit tests for QA agent run handler.
 * Tests core business logic: ticket ID parsing, branch extraction, body parsing, and prompt building.
 */

import { describe, it, expect } from 'vitest'
import {
  humanReadableCursorError,
  parseTicketId,
  extractBranchInfo,
  parseTicketBodySections,
  buildPromptText,
} from './run-helpers.js'

describe('humanReadableCursorError', () => {
  it('formats 401 as authentication error', () => {
    expect(humanReadableCursorError(401)).toBe(
      'Cursor API authentication failed. Check that CURSOR_API_KEY is valid.'
    )
  })

  it('formats 403 as access denied error', () => {
    expect(humanReadableCursorError(403)).toBe(
      'Cursor API access denied. Your plan may not include Cloud Agents API.'
    )
  })

  it('formats 429 as rate limit error', () => {
    expect(humanReadableCursorError(429)).toBe(
      'Cursor API rate limit exceeded. Please try again in a moment.'
    )
  })

  it('formats 500+ as server error', () => {
    expect(humanReadableCursorError(500)).toBe('Cursor API server error (500). Please try again later.')
    expect(humanReadableCursorError(503)).toBe('Cursor API server error (503). Please try again later.')
  })

  it('formats other status codes with detail', () => {
    expect(humanReadableCursorError(400)).toBe('Cursor API request failed (400)')
    expect(humanReadableCursorError(404, 'Not found')).toBe('Cursor API request failed (404) — Not found')
    expect(humanReadableCursorError(400, 'a'.repeat(200))).toBe(
      'Cursor API request failed (400) — ' + 'a'.repeat(100)
    )
  })
})

describe('parseTicketId', () => {
  it('extracts ticket ID from "QA ticket 0046"', () => {
    expect(parseTicketId('QA ticket 0046')).toBe('0046')
  })

  it('extracts ticket ID from "qa ticket 1234" (lowercase)', () => {
    expect(parseTicketId('qa ticket 1234')).toBe('1234')
  })

  it('extracts ticket ID from "QA TICKET 9999" (uppercase)', () => {
    expect(parseTicketId('QA TICKET 9999')).toBe('9999')
  })

  it('extracts ticket ID with extra whitespace', () => {
    expect(parseTicketId('QA   ticket   0046')).toBe('0046')
  })

  it('returns null for invalid format', () => {
    expect(parseTicketId('QA ticket 46')).toBeNull()
    expect(parseTicketId('QA ticket 004')).toBeNull()
    expect(parseTicketId('QA ticket 00461')).toBeNull()
    expect(parseTicketId('Review ticket 0046')).toBeNull()
    expect(parseTicketId('')).toBeNull()
  })
})

describe('extractBranchInfo', () => {
  it('extracts branch name from ticket body', () => {
    const bodyMd = '**Branch**: `ticket/0046-implementation`'
    const result = extractBranchInfo(bodyMd, '0046')
    expect(result.branchName).toBe('ticket/0046-implementation')
    expect(result.refForApi).toBe('ticket/0046-implementation')
  })

  it('uses default branch name when not specified', () => {
    const bodyMd = '## Goal\n\nSome goal'
    const result = extractBranchInfo(bodyMd, '0046')
    expect(result.branchName).toBe('ticket/0046-implementation')
    expect(result.refForApi).toBe('ticket/0046-implementation')
  })

  it('detects merged to main for QA and uses main as ref', () => {
    const bodyMd = '**Branch**: `ticket/0046-implementation`\n\nMerged to `main` for QA access'
    const result = extractBranchInfo(bodyMd, '0046')
    expect(result.branchName).toBe('ticket/0046-implementation')
    expect(result.refForApi).toBe('main')
  })

  it('handles branch name with backticks', () => {
    const bodyMd = '**Branch**: `feature/new-feature`'
    const result = extractBranchInfo(bodyMd, '0046')
    expect(result.branchName).toBe('feature/new-feature')
    expect(result.refForApi).toBe('feature/new-feature')
  })

  it('handles branch name without backticks', () => {
    const bodyMd = '**Branch**: ticket/0046-implementation'
    const result = extractBranchInfo(bodyMd, '0046')
    expect(result.branchName).toBe('ticket/0046-implementation')
    expect(result.refForApi).toBe('ticket/0046-implementation')
  })

  it('trims whitespace from branch name', () => {
    const bodyMd = '**Branch**: `  ticket/0046-implementation  `'
    const result = extractBranchInfo(bodyMd, '0046')
    expect(result.branchName).toBe('ticket/0046-implementation')
    expect(result.refForApi).toBe('ticket/0046-implementation')
  })
})

describe('parseTicketBodySections', () => {
  it('extracts goal, deliverable, and criteria from ticket body', () => {
    const bodyMd = `## Goal (one sentence)

Add a feature.

## Human-verifiable deliverable (UI-only)

User sees a button.

## Acceptance criteria (UI-only)

- [ ] Item 1
- [ ] Item 2`

    const result = parseTicketBodySections(bodyMd)
    expect(result.goal).toBe('Add a feature.')
    expect(result.deliverable).toBe('User sees a button.')
    expect(result.criteria).toBe('- [ ] Item 1\n- [ ] Item 2')
  })

  it('handles missing sections gracefully', () => {
    const bodyMd = `## Goal (one sentence)

Add a feature.`

    const result = parseTicketBodySections(bodyMd)
    expect(result.goal).toBe('Add a feature.')
    expect(result.deliverable).toBe('')
    expect(result.criteria).toBe('')
  })

  it('handles empty ticket body', () => {
    const result = parseTicketBodySections('')
    expect(result.goal).toBe('')
    expect(result.deliverable).toBe('')
    expect(result.criteria).toBe('')
  })

  it('extracts sections with different heading formats', () => {
    const bodyMd = `## Goal

Goal text here.

## Human-verifiable deliverable

Deliverable text.

## Acceptance criteria

Criteria text.`

    const result = parseTicketBodySections(bodyMd)
    expect(result.goal).toBe('Goal text here.')
    expect(result.deliverable).toBe('Deliverable text.')
    expect(result.criteria).toBe('Criteria text.')
  })

  it('trims whitespace from extracted sections', () => {
    const bodyMd = `## Goal (one sentence)

  Add a feature.  

## Human-verifiable deliverable (UI-only)

  User sees a button.  `

    const result = parseTicketBodySections(bodyMd)
    expect(result.goal).toBe('Add a feature.')
    expect(result.deliverable).toBe('User sees a button.')
  })
})

describe('buildPromptText', () => {
  it('builds prompt with all required sections', () => {
    const params = {
      repoFullName: 'owner/repo',
      ticketId: '0046',
      displayId: 'HAL-0046',
      branchName: 'ticket/0046-implementation',
      refForApi: 'ticket/0046-implementation',
      halApiUrl: 'https://example.com',
      goal: 'Add feature',
      deliverable: 'User sees button',
      criteria: '- [ ] Item 1',
      qaRules: '# QA Rules\n\nTest rules',
      verifyFromMainNote: '',
    }

    const prompt = buildPromptText(params)
    expect(prompt).toContain('QA this ticket implementation')
    expect(prompt).toContain('owner/repo')
    expect(prompt).toContain('0046')
    expect(prompt).toContain('HAL-0046')
    expect(prompt).toContain('ticket/0046-implementation')
    expect(prompt).toContain('Add feature')
    expect(prompt).toContain('User sees button')
    expect(prompt).toContain('- [ ] Item 1')
    expect(prompt).toContain('# QA Rules')
  })

  it('includes verify from main note when ref is main', () => {
    const params = {
      repoFullName: 'owner/repo',
      ticketId: '0046',
      displayId: 'HAL-0046',
      branchName: 'ticket/0046-implementation',
      refForApi: 'main',
      halApiUrl: 'https://example.com',
      goal: 'Add feature',
      deliverable: 'User sees button',
      criteria: '- [ ] Item 1',
      qaRules: '# QA Rules',
      verifyFromMainNote: '\n**Verify from:** `main` (implementation was merged to main for QA access).',
    }

    const prompt = buildPromptText(params)
    expect(prompt).toContain('**Verify from:** `main`')
    expect(prompt).toContain('implementation was merged to main for QA access')
  })

  it('uses default values for missing sections', () => {
    const params = {
      repoFullName: 'owner/repo',
      ticketId: '0046',
      displayId: 'HAL-0046',
      branchName: 'ticket/0046-implementation',
      refForApi: 'ticket/0046-implementation',
      halApiUrl: 'https://example.com',
      goal: '',
      deliverable: '',
      criteria: '',
      qaRules: '# QA Rules',
      verifyFromMainNote: '',
    }

    const prompt = buildPromptText(params)
    expect(prompt).toContain('(not specified)')
  })

  it('includes all tool call examples', () => {
    const params = {
      repoFullName: 'owner/repo',
      ticketId: '0046',
      displayId: 'HAL-0046',
      branchName: 'ticket/0046-implementation',
      refForApi: 'ticket/0046-implementation',
      halApiUrl: 'https://example.com',
      goal: 'Add feature',
      deliverable: 'User sees button',
      criteria: '- [ ] Item 1',
      qaRules: '# QA Rules',
      verifyFromMainNote: '',
    }

    const prompt = buildPromptText(params)
    expect(prompt).toContain('insert_qa_artifact')
    expect(prompt).toContain('move_ticket_column')
    expect(prompt).toContain('get_ticket_content')
    expect(prompt).toContain('get_artifacts')
  })
})
