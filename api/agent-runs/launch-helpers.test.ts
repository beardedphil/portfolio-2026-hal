/**
 * Unit tests for agent-runs/launch.ts helper functions.
 * Tests core business logic: agent type parsing, ticket body parsing, prompt building, and branch name generation.
 */

import { describe, it, expect } from 'vitest'
import {
  parseAgentType,
  parseTicketBodySections,
  extractBranchNameFromBody,
  generateImplementationBranchName,
  buildImplementationPrompt,
  buildQAPrompt,
  appendExistingPrInfo,
} from './launch-helpers.js'

describe('parseAgentType', () => {
  it('returns "qa" when bodyAgentType is "qa"', () => {
    expect(parseAgentType('qa')).toBe('qa')
  })

  it('returns "project-manager" when bodyAgentType is "project-manager"', () => {
    expect(parseAgentType('project-manager')).toBe('project-manager')
  })

  it('returns "process-review" when bodyAgentType is "process-review"', () => {
    expect(parseAgentType('process-review')).toBe('process-review')
  })

  it('returns "implementation" when bodyAgentType is "implementation"', () => {
    expect(parseAgentType('implementation')).toBe('implementation')
  })

  it('defaults to "implementation" when bodyAgentType is undefined', () => {
    expect(parseAgentType(undefined)).toBe('implementation')
  })

  it('defaults to "implementation" when bodyAgentType is invalid', () => {
    // TypeScript would prevent this, but runtime could have invalid values
    expect(parseAgentType('invalid' as any)).toBe('implementation')
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

  it('extracts content until next heading', () => {
    const bodyMd = `## Goal (one sentence)

First paragraph.

Second paragraph.

## Human-verifiable deliverable (UI-only)

Deliverable text.

## Acceptance criteria (UI-only)

Criteria text.`

    const result = parseTicketBodySections(bodyMd)
    expect(result.goal).toBe('First paragraph.\n\nSecond paragraph.')
    expect(result.deliverable).toBe('Deliverable text.')
    expect(result.criteria).toBe('Criteria text.')
  })
})

describe('extractBranchNameFromBody', () => {
  it('extracts branch name from QA section', () => {
    const bodyMd = `## QA

Branch: ticket/0046-implementation`
    const result = extractBranchNameFromBody(bodyMd)
    expect(result).toBe('ticket/0046-implementation')
  })

  it('extracts branch name with different format', () => {
    const bodyMd = `## QA

Branch: feature/new-feature`
    const result = extractBranchNameFromBody(bodyMd)
    expect(result).toBe('feature/new-feature')
  })

  it('returns null when branch name is not found', () => {
    const bodyMd = `## Goal

Some goal text.`
    const result = extractBranchNameFromBody(bodyMd)
    expect(result).toBeNull()
  })

  it('returns null for empty body', () => {
    const result = extractBranchNameFromBody('')
    expect(result).toBeNull()
  })

  it('handles branch name with extra whitespace', () => {
    const bodyMd = `## QA

Branch:   ticket/0046-implementation   `
    const result = extractBranchNameFromBody(bodyMd)
    expect(result).toBe('ticket/0046-implementation')
  })
})

describe('generateImplementationBranchName', () => {
  it('generates branch name for single digit ticket number', () => {
    expect(generateImplementationBranchName(1)).toBe('ticket/0001-implementation')
  })

  it('generates branch name for two digit ticket number', () => {
    expect(generateImplementationBranchName(46)).toBe('ticket/0046-implementation')
  })

  it('generates branch name for three digit ticket number', () => {
    expect(generateImplementationBranchName(719)).toBe('ticket/0719-implementation')
  })

  it('generates branch name for four digit ticket number', () => {
    expect(generateImplementationBranchName(1234)).toBe('ticket/1234-implementation')
  })

  it('generates branch name for large ticket number', () => {
    expect(generateImplementationBranchName(99999)).toBe('ticket/99999-implementation')
  })
})

describe('buildImplementationPrompt', () => {
  it('builds prompt with all required fields', () => {
    const prompt = buildImplementationPrompt(
      'test/repo',
      719,
      'HAL-0719',
      'col-doing',
      'main',
      'https://example.com',
      'Test goal',
      'Test deliverable',
      'Test criteria'
    )

    expect(prompt).toContain('Implement this ticket.')
    expect(prompt).toContain('**agentType**: implementation')
    expect(prompt).toContain('**repoFullName**: test/repo')
    expect(prompt).toContain('**ticketNumber**: 719')
    expect(prompt).toContain('**displayId**: HAL-0719')
    expect(prompt).toContain('**currentColumnId**: col-doing')
    expect(prompt).toContain('**defaultBranch**: main')
    expect(prompt).toContain('**HAL API base URL**: https://example.com')
    expect(prompt).toContain('## Goal')
    expect(prompt).toContain('Test goal')
    expect(prompt).toContain('## Human-verifiable deliverable')
    expect(prompt).toContain('Test deliverable')
    expect(prompt).toContain('## Acceptance criteria')
    expect(prompt).toContain('Test criteria')
  })

  it('uses default column ID when currentColumnId is null', () => {
    const prompt = buildImplementationPrompt(
      'test/repo',
      719,
      'HAL-0719',
      null,
      'main',
      'https://example.com',
      'Test goal',
      'Test deliverable',
      'Test criteria'
    )

    expect(prompt).toContain('**currentColumnId**: col-unassigned')
  })

  it('uses "(not specified)" for missing goal', () => {
    const prompt = buildImplementationPrompt(
      'test/repo',
      719,
      'HAL-0719',
      'col-doing',
      'main',
      'https://example.com',
      '',
      'Test deliverable',
      'Test criteria'
    )

    expect(prompt).toContain('## Goal')
    expect(prompt).toContain('(not specified)')
  })

  it('uses "(not specified)" for missing deliverable', () => {
    const prompt = buildImplementationPrompt(
      'test/repo',
      719,
      'HAL-0719',
      'col-doing',
      'main',
      'https://example.com',
      'Test goal',
      '',
      'Test criteria'
    )

    expect(prompt).toContain('## Human-verifiable deliverable')
    expect(prompt).toContain('(not specified)')
  })

  it('uses "(not specified)" for missing criteria', () => {
    const prompt = buildImplementationPrompt(
      'test/repo',
      719,
      'HAL-0719',
      'col-doing',
      'main',
      'https://example.com',
      'Test goal',
      'Test deliverable',
      ''
    )

    expect(prompt).toContain('## Acceptance criteria')
    expect(prompt).toContain('(not specified)')
  })
})

describe('buildQAPrompt', () => {
  it('builds prompt with all required fields', () => {
    const prompt = buildQAPrompt(
      'test/repo',
      719,
      'HAL-0719',
      'col-qa',
      'main',
      'https://example.com',
      'Test goal',
      'Test deliverable',
      'Test criteria'
    )

    expect(prompt).toContain('QA this ticket implementation')
    expect(prompt).toContain('**agentType**: qa')
    expect(prompt).toContain('**repoFullName**: test/repo')
    expect(prompt).toContain('**ticketNumber**: 719')
    expect(prompt).toContain('**displayId**: HAL-0719')
    expect(prompt).toContain('**currentColumnId**: col-qa')
    expect(prompt).toContain('## MANDATORY: Load Your Instructions First')
    expect(prompt).toContain('## Goal')
    expect(prompt).toContain('Test goal')
  })

  it('includes instructions loading section', () => {
    const prompt = buildQAPrompt(
      'test/repo',
      719,
      'HAL-0719',
      'col-qa',
      'main',
      'https://example.com',
      'Test goal',
      'Test deliverable',
      'Test criteria'
    )

    expect(prompt).toContain('Load basic instructions')
    expect(prompt).toContain('api/instructions/get')
    expect(prompt).toContain('agentType: \'qa\'')
  })

  it('uses default column ID when currentColumnId is null', () => {
    const prompt = buildQAPrompt(
      'test/repo',
      719,
      'HAL-0719',
      null,
      'main',
      'https://example.com',
      'Test goal',
      'Test deliverable',
      'Test criteria'
    )

    expect(prompt).toContain('**currentColumnId**: col-unassigned')
  })
})

describe('appendExistingPrInfo', () => {
  it('appends existing PR information to prompt', () => {
    const basePrompt = 'Base prompt text.'
    const prUrl = 'https://github.com/test/repo/pull/123'
    const result = appendExistingPrInfo(basePrompt, prUrl)

    expect(result).toContain(basePrompt)
    expect(result).toContain('## Existing PR linked')
    expect(result).toContain(prUrl)
    expect(result).toContain('Do NOT create a new PR')
  })

  it('preserves original prompt content', () => {
    const basePrompt = 'Base prompt text.\n\nMore content.'
    const prUrl = 'https://github.com/test/repo/pull/123'
    const result = appendExistingPrInfo(basePrompt, prUrl)

    expect(result.startsWith(basePrompt)).toBe(true)
    expect(result).toContain('More content.')
  })
})
