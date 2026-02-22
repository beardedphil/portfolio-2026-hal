/**
 * Tests for agent launch endpoint behavior.
 * 
 * These tests verify that:
 * - Ticket body parsing extracts goal, deliverable, and acceptance criteria correctly
 * - Prompt text is built correctly for implementation agents
 * - Prompt text is built correctly for QA agents
 * - Branch name is extracted correctly from ticket body for QA agents
 * - Agent type is determined correctly from request body
 */

import { describe, it, expect } from 'vitest'
import {
  parseTicketBody,
  buildImplementationPrompt,
  buildQAPrompt,
  extractBranchName,
  determineAgentType,
} from './launch.js'

describe('parseTicketBody', () => {
  it('should extract goal, deliverable, and acceptance criteria from ticket body', () => {
    const bodyMd = `## Goal (one sentence)

Add a feature to the app.

## Human-verifiable deliverable (UI-only)

User sees a button.

## Acceptance criteria (UI-only)

- [ ] Button is visible
- [ ] Button is clickable
- [ ] Clicking shows a message`

    const { goal, deliverable, criteria } = parseTicketBody(bodyMd)

    expect(goal).toBe('Add a feature to the app.')
    expect(deliverable).toBe('User sees a button.')
    expect(criteria).toContain('- [ ] Button is visible')
  })

  it('should handle missing sections gracefully', () => {
    const bodyMd = `## Goal (one sentence)

Add a feature.`

    const { goal, deliverable, criteria } = parseTicketBody(bodyMd)

    expect(goal).toBe('Add a feature.')
    expect(deliverable).toBe('')
    expect(criteria).toBe('')
  })

  it('should handle empty ticket body', () => {
    const bodyMd = ''

    const { goal, deliverable, criteria } = parseTicketBody(bodyMd)

    expect(goal).toBe('')
    expect(deliverable).toBe('')
    expect(criteria).toBe('')
  })
})

describe('buildImplementationPrompt', () => {
  it('should build correct prompt text for implementation agent', () => {
    const params = {
      repoFullName: 'test/repo',
      ticketNumber: 123,
      displayId: 'HAL-0123',
      currentColumnId: 'col-doing',
      defaultBranch: 'main',
      halApiBaseUrl: 'https://example.com',
      goal: 'Add a feature',
      deliverable: 'User sees a button',
      criteria: '- [ ] Button is visible',
    }

    const promptText = buildImplementationPrompt(params)

    expect(promptText).toContain('Implement this ticket.')
    expect(promptText).toContain('test/repo')
    expect(promptText).toContain('HAL-0123')
    expect(promptText).toContain('col-doing')
    expect(promptText).toContain('Add a feature')
    expect(promptText).toContain('User sees a button')
    expect(promptText).toContain('- [ ] Button is visible')
  })

  it('should use default values for missing fields', () => {
    const params = {
      repoFullName: 'test/repo',
      ticketNumber: 123,
      displayId: 'HAL-0123',
      currentColumnId: null,
      defaultBranch: 'main',
      halApiBaseUrl: 'https://example.com',
      goal: '',
      deliverable: '',
      criteria: '',
    }

    const promptText = buildImplementationPrompt(params)

    expect(promptText).toContain('col-unassigned')
    expect(promptText).toContain('(not specified)')
  })
})

describe('buildQAPrompt', () => {
  it('should build correct prompt text for QA agent', () => {
    const params = {
      repoFullName: 'test/repo',
      ticketNumber: 123,
      displayId: 'HAL-0123',
      currentColumnId: 'col-qa',
      defaultBranch: 'main',
      halApiBaseUrl: 'https://example.com',
      goal: 'Add a feature',
      deliverable: 'User sees a button',
      criteria: '- [ ] Button is visible',
    }

    const promptText = buildQAPrompt(params)

    expect(promptText).toContain('QA this ticket implementation')
    expect(promptText).toContain('test/repo')
    expect(promptText).toContain('HAL-0123')
    expect(promptText).toContain('col-qa')
    expect(promptText).toContain('Load Your Instructions First')
    expect(promptText).toContain('Add a feature')
  })
})

describe('extractBranchName', () => {
  it('should extract branch name from QA ticket body', () => {
    const bodyMd = `## QA

Branch: feature/my-branch

Some other content.`

    const branchName = extractBranchName(bodyMd)

    expect(branchName).toBe('feature/my-branch')
  })

  it('should return undefined when branch is not found', () => {
    const bodyMd = `## QA

Some content without branch.`

    const branchName = extractBranchName(bodyMd)

    expect(branchName).toBeUndefined()
  })

  it('should handle branch name with spaces', () => {
    const bodyMd = `## QA

Branch: feature/my branch name`

    const branchName = extractBranchName(bodyMd)

    expect(branchName).toBe('feature/my branch name')
  })
})

describe('determineAgentType', () => {
  it('should return correct agent type from request body', () => {
    const testCases = [
      { body: { agentType: 'qa' }, expected: 'qa' },
      { body: { agentType: 'project-manager' }, expected: 'project-manager' },
      { body: { agentType: 'process-review' }, expected: 'process-review' },
      { body: { agentType: 'implementation' }, expected: 'implementation' },
      { body: {}, expected: 'implementation' },
      { body: { agentType: 'invalid' }, expected: 'implementation' },
    ]

    testCases.forEach(({ body, expected }) => {
      const agentType = determineAgentType(body as any)
      expect(agentType).toBe(expected)
    })
  })
})
