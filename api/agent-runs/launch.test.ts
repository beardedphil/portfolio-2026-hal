/**
 * Tests for agent-runs launch endpoint.
 * 
 * These tests verify:
 * - Agent type parsing
 * - Ticket body parsing (goal, deliverable, criteria extraction)
 * - Prompt text building for different agent types
 * - Branch name extraction for QA agents
 */

import { describe, it, expect } from 'vitest'
import {
  parseAgentType,
  parseTicketBody,
  extractBranchName,
  buildImplementationPrompt,
  buildQAPrompt,
} from './launch.js'

describe('parseAgentType', () => {
  it('should default to implementation when agentType is not provided', () => {
    expect(parseAgentType({})).toBe('implementation')
  })

  it('should parse qa agent type correctly', () => {
    expect(parseAgentType({ agentType: 'qa' })).toBe('qa')
  })

  it('should parse project-manager agent type correctly', () => {
    expect(parseAgentType({ agentType: 'project-manager' })).toBe('project-manager')
  })

  it('should parse process-review agent type correctly', () => {
    expect(parseAgentType({ agentType: 'process-review' })).toBe('process-review')
  })

  it('should default to implementation for unknown agent types', () => {
    expect(parseAgentType({ agentType: 'unknown' as any })).toBe('implementation')
  })
})

describe('parseTicketBody', () => {
  it('should extract goal, deliverable, and criteria from ticket body', () => {
    const bodyMd = `## Goal (one sentence)

Implement feature X

## Human-verifiable deliverable (UI-only)

User sees button

## Acceptance criteria (UI-only)

- [ ] Criterion 1
- [ ] Criterion 2`

    const result = parseTicketBody(bodyMd)

    expect(result.goal).toBe('Implement feature X')
    expect(result.deliverable).toBe('User sees button')
    expect(result.criteria).toContain('Criterion 1')
    expect(result.criteria).toContain('Criterion 2')
  })

  it('should handle missing sections gracefully', () => {
    const bodyMd = 'Some content without sections'

    const result = parseTicketBody(bodyMd)

    expect(result.goal).toBe('')
    expect(result.deliverable).toBe('')
    expect(result.criteria).toBe('')
  })

  it('should handle case-insensitive headings', () => {
    const bodyMd = `## GOAL

Test goal

## human-verifiable DELIVERABLE

Test deliverable`

    const result = parseTicketBody(bodyMd)

    expect(result.goal).toBe('Test goal')
    expect(result.deliverable).toBe('Test deliverable')
  })

  it('should extract content until next heading', () => {
    const bodyMd = `## Goal (one sentence)

This is the goal content
with multiple lines

## Constraints

This should not be in goal`

    const result = parseTicketBody(bodyMd)

    expect(result.goal).toBe('This is the goal content\nwith multiple lines')
    expect(result.goal).not.toContain('Constraints')
  })

  it('should trim whitespace from extracted content', () => {
    const bodyMd = `## Goal (one sentence)

  Padded content  

## Next section`

    const result = parseTicketBody(bodyMd)

    expect(result.goal).toBe('Padded content')
  })
})

describe('extractBranchName', () => {
  it('should extract branch name from ticket body for QA agents', () => {
    const bodyMd = `## QA

Branch: feature/my-branch

Some other content`

    const result = extractBranchName(bodyMd)

    expect(result).toBe('feature/my-branch')
  })

  it('should handle branch name with colon separator', () => {
    const bodyMd = `## QA

Branch: feature:my-branch`

    const result = extractBranchName(bodyMd)

    expect(result).toBe('feature:my-branch')
  })

  it('should handle branch name with space separator', () => {
    const bodyMd = `## QA

Branch feature/my-branch`

    const result = extractBranchName(bodyMd)

    expect(result).toBe('feature/my-branch')
  })

  it('should return null when branch name is not found', () => {
    const bodyMd = `## QA

Some content without branch`

    const result = extractBranchName(bodyMd)

    expect(result).toBeNull()
  })

  it('should handle case-insensitive QA heading', () => {
    const bodyMd = `## qa

Branch: feature/my-branch`

    const result = extractBranchName(bodyMd)

    expect(result).toBe('feature/my-branch')
  })

  it('should trim whitespace from branch name', () => {
    const bodyMd = `## QA

Branch:   feature/my-branch   `

    const result = extractBranchName(bodyMd)

    expect(result).toBe('feature/my-branch')
  })
})

describe('buildImplementationPrompt', () => {
  it('should build prompt with all required inputs', () => {
    const params = {
      repoFullName: 'test/repo',
      ticketNumber: 123,
      displayId: 'HAL-0123',
      currentColumnId: 'col-todo',
      defaultBranch: 'main',
      halApiBaseUrl: 'https://test.example.com',
      goal: 'Implement feature X',
      deliverable: 'User sees button',
      criteria: '- [ ] Criterion 1',
    }

    const result = buildImplementationPrompt(params)

    expect(result).toContain('Implement this ticket')
    expect(result).toContain('**agentType**: implementation')
    expect(result).toContain('test/repo')
    expect(result).toContain('123')
    expect(result).toContain('HAL-0123')
    expect(result).toContain('col-todo')
    expect(result).toContain('main')
    expect(result).toContain('https://test.example.com')
    expect(result).toContain('Implement feature X')
    expect(result).toContain('User sees button')
    expect(result).toContain('Criterion 1')
  })

  it('should use default column ID when currentColumnId is null', () => {
    const params = {
      repoFullName: 'test/repo',
      ticketNumber: 123,
      displayId: 'HAL-0123',
      currentColumnId: null,
      defaultBranch: 'main',
      halApiBaseUrl: 'https://test.example.com',
      goal: 'Test goal',
      deliverable: 'Test deliverable',
      criteria: 'Test criteria',
    }

    const result = buildImplementationPrompt(params)

    expect(result).toContain('col-unassigned')
  })

  it('should show "(not specified)" for empty goal', () => {
    const params = {
      repoFullName: 'test/repo',
      ticketNumber: 123,
      displayId: 'HAL-0123',
      currentColumnId: 'col-todo',
      defaultBranch: 'main',
      halApiBaseUrl: 'https://test.example.com',
      goal: '',
      deliverable: 'Test deliverable',
      criteria: 'Test criteria',
    }

    const result = buildImplementationPrompt(params)

    expect(result).toContain('(not specified)')
  })
})

describe('buildQAPrompt', () => {
  it('should build prompt with all required inputs', () => {
    const params = {
      repoFullName: 'test/repo',
      ticketNumber: 123,
      displayId: 'HAL-0123',
      currentColumnId: 'col-qa',
      defaultBranch: 'main',
      halApiBaseUrl: 'https://test.example.com',
      goal: 'QA feature X',
      deliverable: 'Verify button works',
      criteria: '- [ ] Test passes',
    }

    const result = buildQAPrompt(params)

    expect(result).toContain('QA this ticket implementation')
    expect(result).toContain('**agentType**: qa')
    expect(result).toContain('test/repo')
    expect(result).toContain('123')
    expect(result).toContain('HAL-0123')
    expect(result).toContain('col-qa')
    expect(result).toContain('main')
    expect(result).toContain('https://test.example.com')
    expect(result).toContain('QA feature X')
    expect(result).toContain('Verify button works')
    expect(result).toContain('Test passes')
  })

  it('should include instructions loading section', () => {
    const params = {
      repoFullName: 'test/repo',
      ticketNumber: 123,
      displayId: 'HAL-0123',
      currentColumnId: 'col-qa',
      defaultBranch: 'main',
      halApiBaseUrl: 'https://test.example.com',
      goal: 'Test goal',
      deliverable: 'Test deliverable',
      criteria: 'Test criteria',
    }

    const result = buildQAPrompt(params)

    expect(result).toContain('Load Your Instructions First')
    expect(result).toContain('api/instructions/get')
    expect(result).toContain('agentType: \'qa\'')
  })

  it('should use default column ID when currentColumnId is null', () => {
    const params = {
      repoFullName: 'test/repo',
      ticketNumber: 123,
      displayId: 'HAL-0123',
      currentColumnId: null,
      defaultBranch: 'main',
      halApiBaseUrl: 'https://test.example.com',
      goal: 'Test goal',
      deliverable: 'Test deliverable',
      criteria: 'Test criteria',
    }

    const result = buildQAPrompt(params)

    expect(result).toContain('col-unassigned')
  })

  it('should show "(not specified)" for empty sections', () => {
    const params = {
      repoFullName: 'test/repo',
      ticketNumber: 123,
      displayId: 'HAL-0123',
      currentColumnId: 'col-qa',
      defaultBranch: 'main',
      halApiBaseUrl: 'https://test.example.com',
      goal: '',
      deliverable: '',
      criteria: '',
    }

    const result = buildQAPrompt(params)

    expect(result).toContain('(not specified)')
  })
})
