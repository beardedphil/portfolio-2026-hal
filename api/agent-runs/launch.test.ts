/**
 * Unit tests for agent-runs/launch.ts helper functions.
 * Tests core business logic: agent type parsing, ticket body parsing, and prompt building.
 */

import { describe, it, expect } from 'vitest'
import {
  parseAgentType,
  parseTicketBodySections,
  extractBranchNameFromTicketBody,
  buildImplementationPrompt,
  buildQAPrompt,
  getBranchNameForLaunch,
} from './launch-helpers.js'

describe('parseAgentType', () => {
  it('parses "qa" agent type', () => {
    expect(parseAgentType('qa')).toBe('qa')
  })

  it('parses "project-manager" agent type', () => {
    expect(parseAgentType('project-manager')).toBe('project-manager')
  })

  it('parses "process-review" agent type', () => {
    expect(parseAgentType('process-review')).toBe('process-review')
  })

  it('defaults to "implementation" for undefined', () => {
    expect(parseAgentType(undefined)).toBe('implementation')
  })

  it('defaults to "implementation" for invalid value', () => {
    expect(parseAgentType('invalid')).toBe('implementation')
    expect(parseAgentType('')).toBe('implementation')
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

  it('handles sections with extra whitespace', () => {
    const bodyMd = `## Goal (one sentence)

  Goal with spaces.

## Human-verifiable deliverable (UI-only)

  Deliverable with spaces.

## Acceptance criteria (UI-only)

  Criteria with spaces.`

    const result = parseTicketBodySections(bodyMd)
    expect(result.goal).toBe('Goal with spaces.')
    expect(result.deliverable).toBe('Deliverable with spaces.')
    expect(result.criteria).toBe('Criteria with spaces.')
  })
})

describe('extractBranchNameFromTicketBody', () => {
  it('extracts branch name from QA section', () => {
    const bodyMd = `## QA

Branch: feature/my-branch
Some other text.`

    expect(extractBranchNameFromTicketBody(bodyMd)).toBe('feature/my-branch')
  })

  it('extracts branch name with colon separator', () => {
    const bodyMd = `## QA Section

Branch: ticket/0123-implementation`

    expect(extractBranchNameFromTicketBody(bodyMd)).toBe('ticket/0123-implementation')
  })

  it('extracts branch name with space separator', () => {
    const bodyMd = `## QA

Branch feature/my-branch`

    expect(extractBranchNameFromTicketBody(bodyMd)).toBe('feature/my-branch')
  })

  it('returns null when branch not found', () => {
    const bodyMd = `## QA

No branch information here.`

    expect(extractBranchNameFromTicketBody(bodyMd)).toBeNull()
  })

  it('returns null for empty body', () => {
    expect(extractBranchNameFromTicketBody('')).toBeNull()
  })
})

describe('buildImplementationPrompt', () => {
  it('builds complete implementation prompt with all sections', () => {
    const params = {
      repoFullName: 'test/repo',
      ticketNumber: 123,
      displayId: 'HAL-0123',
      currentColumnId: 'col-todo',
      defaultBranch: 'main',
      halApiBaseUrl: 'https://example.com',
      goal: 'Add a feature',
      deliverable: 'User sees button',
      criteria: '- [ ] Item 1',
    }

    const prompt = buildImplementationPrompt(params)
    
    expect(prompt).toContain('Implement this ticket.')
    expect(prompt).toContain('**agentType**: implementation')
    expect(prompt).toContain('**repoFullName**: test/repo')
    expect(prompt).toContain('**ticketNumber**: 123')
    expect(prompt).toContain('**displayId**: HAL-0123')
    expect(prompt).toContain('**currentColumnId**: col-todo')
    expect(prompt).toContain('**defaultBranch**: main')
    expect(prompt).toContain('**HAL API base URL**: https://example.com')
    expect(prompt).toContain('## Goal')
    expect(prompt).toContain('Add a feature')
    expect(prompt).toContain('## Human-verifiable deliverable')
    expect(prompt).toContain('User sees button')
    expect(prompt).toContain('## Acceptance criteria')
    expect(prompt).toContain('- [ ] Item 1')
  })

  it('uses default values for missing sections', () => {
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

    const prompt = buildImplementationPrompt(params)
    
    expect(prompt).toContain('**currentColumnId**: col-unassigned')
    expect(prompt).toContain('## Goal')
    expect(prompt).toContain('(not specified)')
    expect(prompt).toContain('## Human-verifiable deliverable')
    expect(prompt).toContain('(not specified)')
    expect(prompt).toContain('## Acceptance criteria')
    expect(prompt).toContain('(not specified)')
  })
})

describe('buildQAPrompt', () => {
  it('builds complete QA prompt with all sections', () => {
    const params = {
      repoFullName: 'test/repo',
      ticketNumber: 123,
      displayId: 'HAL-0123',
      currentColumnId: 'col-qa',
      defaultBranch: 'main',
      halApiBaseUrl: 'https://example.com',
      goal: 'Add a feature',
      deliverable: 'User sees button',
      criteria: '- [ ] Item 1',
    }

    const prompt = buildQAPrompt(params)
    
    expect(prompt).toContain('QA this ticket implementation')
    expect(prompt).toContain('**agentType**: qa')
    expect(prompt).toContain('**repoFullName**: test/repo')
    expect(prompt).toContain('**ticketNumber**: 123')
    expect(prompt).toContain('**displayId**: HAL-0123')
    expect(prompt).toContain('**currentColumnId**: col-qa')
    expect(prompt).toContain('## MANDATORY: Load Your Instructions First')
    expect(prompt).toContain('## Goal')
    expect(prompt).toContain('Add a feature')
    expect(prompt).toContain('## Human-verifiable deliverable')
    expect(prompt).toContain('User sees button')
    expect(prompt).toContain('## Acceptance criteria')
    expect(prompt).toContain('- [ ] Item 1')
  })

  it('includes instructions loading section', () => {
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

    const prompt = buildQAPrompt(params)
    
    expect(prompt).toContain('## MANDATORY: Load Your Instructions First')
    expect(prompt).toContain('agentType: \'qa\'')
    expect(prompt).toContain('includeBasic: true')
  })
})

describe('getBranchNameForLaunch', () => {
  it('returns implementation branch name for implementation agent', () => {
    expect(getBranchNameForLaunch('implementation', 123, 'main')).toBe('ticket/0123-implementation')
    expect(getBranchNameForLaunch('implementation', 1, 'main')).toBe('ticket/0001-implementation')
    expect(getBranchNameForLaunch('implementation', 9999, 'main')).toBe('ticket/9999-implementation')
  })

  it('returns default branch for non-implementation agents', () => {
    expect(getBranchNameForLaunch('qa', 123, 'main')).toBe('main')
    expect(getBranchNameForLaunch('qa', 123, 'develop')).toBe('develop')
    expect(getBranchNameForLaunch('project-manager', 123, 'main')).toBe('main')
    expect(getBranchNameForLaunch('process-review', 123, 'main')).toBe('main')
  })
})
