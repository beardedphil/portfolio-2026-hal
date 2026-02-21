/**
 * Unit tests for implementation agent run handler.
 * Tests core business logic: ticket ID parsing, prompt building, and validation.
 */

import { describe, it, expect } from 'vitest'
import {
  parseTicketId,
  parseTicketBodySections,
  findImplementationAgentNote,
  buildPromptText,
} from './run-helpers.js'

describe('parseTicketId', () => {
  it('extracts ticket ID from "Implement ticket 0046"', () => {
    expect(parseTicketId('Implement ticket 0046')).toBe('0046')
  })

  it('extracts ticket ID from "implement ticket 1234" (lowercase)', () => {
    expect(parseTicketId('implement ticket 1234')).toBe('1234')
  })

  it('extracts ticket ID from "IMPLEMENT TICKET 9999" (uppercase)', () => {
    expect(parseTicketId('IMPLEMENT TICKET 9999')).toBe('9999')
  })

  it('extracts ticket ID with extra whitespace', () => {
    expect(parseTicketId('Implement   ticket   0046')).toBe('0046')
  })

  it('returns null for invalid format', () => {
    expect(parseTicketId('Implement ticket 46')).toBeNull()
    expect(parseTicketId('Implement ticket 004')).toBeNull()
    expect(parseTicketId('Implement ticket 00461')).toBeNull()
    expect(parseTicketId('Fix ticket 0046')).toBeNull()
    expect(parseTicketId('')).toBeNull()
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
    const bodyMd = `## Goal (one sentence)

Goal text here.

## Human-verifiable deliverable (UI-only)

Deliverable text.

## Acceptance criteria (UI-only)

Criteria text.`

    const result = parseTicketBodySections(bodyMd)
    expect(result.goal).toBe('Goal text here.')
    expect(result.deliverable).toBe('Deliverable text.')
    expect(result.criteria).toBe('Criteria text.')
  })
})

describe('findImplementationAgentNote', () => {
  it('finds note with "Implementation agent note" in title', () => {
    const artifacts = [
      { title: 'QA report for ticket 0046', body_md: 'Report content' },
      { title: 'Implementation agent note for ticket 0046', body_md: 'Fix the bug' },
    ]
    expect(findImplementationAgentNote(artifacts)).toBe('Fix the bug')
  })

  it('finds note with "Note for implementation agent" in title', () => {
    const artifacts = [
      { title: 'Note for implementation agent: 0046', body_md: 'Address issues' },
    ]
    expect(findImplementationAgentNote(artifacts)).toBe('Address issues')
  })

  it('returns null when no note artifact exists', () => {
    const artifacts = [
      { title: 'QA report for ticket 0046', body_md: 'Report content' },
      { title: 'Plan for ticket 0046', body_md: 'Plan content' },
    ]
    expect(findImplementationAgentNote(artifacts)).toBeNull()
  })

  it('returns null for empty artifacts array', () => {
    expect(findImplementationAgentNote([])).toBeNull()
  })

  it('handles case-insensitive title matching', () => {
    const artifacts = [
      { title: 'IMPLEMENTATION AGENT NOTE for ticket 0046', body_md: 'Fix it' },
    ]
    expect(findImplementationAgentNote(artifacts)).toBe('Fix it')
  })

  it('returns null for note with empty body', () => {
    const artifacts = [
      { title: 'Implementation agent note for ticket 0046', body_md: '' },
    ]
    expect(findImplementationAgentNote(artifacts)).toBeNull()
  })

  it('trims whitespace from note body', () => {
    const artifacts = [
      { title: 'Implementation agent note for ticket 0046', body_md: '  Fix the bug  ' },
    ]
    expect(findImplementationAgentNote(artifacts)).toBe('Fix the bug')
  })
})

describe('buildPromptText', () => {
  it('builds prompt with all required sections', () => {
    const params = {
      repoFullName: 'owner/repo',
      ticketId: '0046',
      displayId: 'HAL-0046',
      currentColumnId: 'col-todo',
      halApiUrl: 'https://example.com',
      goal: 'Add feature',
      deliverable: 'User sees button',
      criteria: '- [ ] Item 1',
      bodyMd: 'Full ticket body',
      implementationAgentNote: null,
      isBackInTodo: true,
    }

    const prompt = buildPromptText(params)
    expect(prompt).toContain('Implement this ticket.')
    expect(prompt).toContain('owner/repo')
    expect(prompt).toContain('0046')
    expect(prompt).toContain('HAL-0046')
    expect(prompt).toContain('Add feature')
    expect(prompt).toContain('User sees button')
    expect(prompt).toContain('- [ ] Item 1')
    expect(prompt).toContain('Full ticket body')
  })

  it('includes implementation agent note when present', () => {
    const params = {
      repoFullName: 'owner/repo',
      ticketId: '0046',
      displayId: 'HAL-0046',
      currentColumnId: 'col-todo',
      halApiUrl: 'https://example.com',
      goal: 'Add feature',
      deliverable: 'User sees button',
      criteria: '- [ ] Item 1',
      bodyMd: 'Full ticket body',
      implementationAgentNote: 'Fix the bug in line 42',
      isBackInTodo: false,
    }

    const prompt = buildPromptText(params)
    expect(prompt).toContain('## IMPORTANT: Previous QA Failure — Implementation Agent Note')
    expect(prompt).toContain('Fix the bug in line 42')
    expect(prompt).toContain('You MUST address every issue')
  })

  it('includes failure notes section when no note present', () => {
    const params = {
      repoFullName: 'owner/repo',
      ticketId: '0046',
      displayId: 'HAL-0046',
      currentColumnId: 'col-todo',
      halApiUrl: 'https://example.com',
      goal: 'Add feature',
      deliverable: 'User sees button',
      criteria: '- [ ] Item 1',
      bodyMd: 'Full ticket body',
      implementationAgentNote: null,
      isBackInTodo: true,
    }

    const prompt = buildPromptText(params)
    expect(prompt).toContain('## IMPORTANT: Read Failure Notes Before Starting')
    expect(prompt).toContain('⚠️ This ticket is back in To Do')
  })

  it('uses default values for missing sections', () => {
    const params = {
      repoFullName: 'owner/repo',
      ticketId: '0046',
      displayId: 'HAL-0046',
      currentColumnId: null,
      halApiUrl: 'https://example.com',
      goal: '',
      deliverable: '',
      criteria: '',
      bodyMd: 'Full ticket body',
      implementationAgentNote: null,
      isBackInTodo: false,
    }

    const prompt = buildPromptText(params)
    expect(prompt).toContain('(not specified)')
    expect(prompt).toContain('col-unassigned')
  })
})
