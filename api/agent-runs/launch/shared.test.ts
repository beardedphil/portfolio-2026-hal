/**
 * Unit tests for launch/shared.ts
 * 
 * These tests verify the extracted functions in isolation:
 * - determineAgentType: agent type determination logic
 * - parseTicketContent: ticket body parsing
 */

import { describe, it, expect } from 'vitest'
import { determineAgentType, parseTicketContent } from './shared.js'

describe('determineAgentType', () => {
  it('returns "qa" when agentType is "qa"', () => {
    expect(determineAgentType({ agentType: 'qa' })).toBe('qa')
  })

  it('returns "project-manager" when agentType is "project-manager"', () => {
    expect(determineAgentType({ agentType: 'project-manager' })).toBe('project-manager')
  })

  it('returns "process-review" when agentType is "process-review"', () => {
    expect(determineAgentType({ agentType: 'process-review' })).toBe('process-review')
  })

  it('defaults to "implementation" when agentType is missing', () => {
    expect(determineAgentType({})).toBe('implementation')
  })

  it('defaults to "implementation" when agentType is undefined', () => {
    expect(determineAgentType({ agentType: undefined })).toBe('implementation')
  })
})

describe('parseTicketContent', () => {
  it('extracts goal, deliverable, and criteria from well-formed markdown', () => {
    const bodyMd = `## Goal (one sentence)

Add a feature.

## Human-verifiable deliverable (UI-only)

User sees a button.

## Acceptance criteria (UI-only)

- [ ] Button is visible
- [ ] Button is clickable`

    const result = parseTicketContent(bodyMd)
    expect(result.goal).toBe('Add a feature.')
    expect(result.deliverable).toBe('User sees a button.')
    expect(result.criteria).toBe('- [ ] Button is visible\n- [ ] Button is clickable')
  })

  it('handles missing sections gracefully', () => {
    const bodyMd = `## Goal (one sentence)

Add a feature.`

    const result = parseTicketContent(bodyMd)
    expect(result.goal).toBe('Add a feature.')
    expect(result.deliverable).toBe('')
    expect(result.criteria).toBe('')
  })

  it('handles empty body', () => {
    const result = parseTicketContent('')
    expect(result.goal).toBe('')
    expect(result.deliverable).toBe('')
    expect(result.criteria).toBe('')
  })

  it('extracts content with multiple lines', () => {
    const bodyMd = `## Goal (one sentence)

Add a feature
that does something.

## Human-verifiable deliverable (UI-only)

User sees a button
and can click it.`

    const result = parseTicketContent(bodyMd)
    expect(result.goal).toBe('Add a feature\nthat does something.')
    expect(result.deliverable).toBe('User sees a button\nand can click it.')
  })

  it('handles case-insensitive section headers', () => {
    const bodyMd = `## goal (one sentence)

Add a feature.

## HUMAN-VERIFIABLE DELIVERABLE (UI-only)

User sees a button.`

    const result = parseTicketContent(bodyMd)
    expect(result.goal).toBe('Add a feature.')
    expect(result.deliverable).toBe('User sees a button.')
  })

  it('stops parsing at next section header', () => {
    const bodyMd = `## Goal (one sentence)

Add a feature.
This is part of the goal.

## Constraints

Keep it simple.

## Acceptance criteria (UI-only)

- [ ] Test criteria`

    const result = parseTicketContent(bodyMd)
    expect(result.goal).toBe('Add a feature.\nThis is part of the goal.')
    expect(result.criteria).toBe('- [ ] Test criteria')
  })
})
