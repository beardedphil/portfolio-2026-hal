/**
 * Tests for launch.ts helper functions.
 * 
 * These tests verify the extracted helper functions work correctly:
 * - determineAgentType: correctly determines agent type
 * - parseTicketSections: correctly extracts ticket sections
 * - buildImplementationPrompt: builds correct implementation prompt
 * - buildQAPrompt: builds correct QA prompt
 */

import { describe, it, expect } from 'vitest'
import {
  determineAgentType,
  parseTicketSections,
  buildImplementationPrompt,
  buildQAPrompt,
} from './launch.js'

describe('determineAgentType', () => {
  it('should default to implementation when agentType is not provided', () => {
    expect(determineAgentType({})).toBe('implementation')
  })

  it('should return qa when agentType is "qa"', () => {
    expect(determineAgentType({ agentType: 'qa' })).toBe('qa')
  })

  it('should return project-manager when agentType is "project-manager"', () => {
    expect(determineAgentType({ agentType: 'project-manager' })).toBe('project-manager')
  })
})

describe('parseTicketSections', () => {
  it('should extract Goal, Deliverable, and Acceptance criteria from ticket body', () => {
    const bodyMd = [
      '## Goal (one sentence)',
      '',
      'Improve maintainability of launch.ts',
      '',
      '## Human-verifiable deliverable (UI-only)',
      '',
      'User sees improved metrics',
      '',
      '## Acceptance criteria (UI-only)',
      '',
      '- [ ] Maintainability increases',
      '- [ ] Coverage increases',
    ].join('\n')

    const sections = parseTicketSections(bodyMd)

    expect(sections.goal).toBe('Improve maintainability of launch.ts')
    expect(sections.deliverable).toBe('User sees improved metrics')
    expect(sections.criteria).toContain('Maintainability increases')
    expect(sections.criteria).toContain('Coverage increases')
  })

  it('should handle missing sections gracefully', () => {
    const bodyMd = 'Some content without sections'
    const sections = parseTicketSections(bodyMd)

    expect(sections.goal).toBe('')
    expect(sections.deliverable).toBe('')
    expect(sections.criteria).toBe('')
  })
})

describe('buildImplementationPrompt', () => {
  it('should build implementation prompt with all required sections', () => {
    const sections = {
      goal: 'Test goal',
      deliverable: 'Test deliverable',
      criteria: '- [ ] Test AC',
    }

    const prompt = buildImplementationPrompt(
      'test/repo',
      123,
      '0123',
      'col-todo',
      'main',
      'https://test.example.com',
      sections
    )

    expect(prompt).toContain('Implement this ticket')
    expect(prompt).toContain('**agentType**: implementation')
    expect(prompt).toContain('**repoFullName**: test/repo')
    expect(prompt).toContain('**ticketNumber**: 123')
    expect(prompt).toContain('**displayId**: 0123')
    expect(prompt).toContain('## Goal')
    expect(prompt).toContain('Test goal')
    expect(prompt).toContain('## Human-verifiable deliverable')
    expect(prompt).toContain('Test deliverable')
    expect(prompt).toContain('## Acceptance criteria')
    expect(prompt).toContain('- [ ] Test AC')
  })
})

describe('buildQAPrompt', () => {
  it('should build QA prompt with instructions loading section', () => {
    const sections = {
      goal: 'Test goal',
      deliverable: 'Test deliverable',
      criteria: '- [ ] Test AC',
    }

    const prompt = buildQAPrompt(
      'test/repo',
      123,
      '0123',
      'col-qa',
      'main',
      'https://test.example.com',
      sections
    )

    expect(prompt).toContain('QA this ticket implementation')
    expect(prompt).toContain('**agentType**: qa')
    expect(prompt).toContain('MANDATORY: Load Your Instructions First')
    expect(prompt).toContain('/api/instructions/get')
    expect(prompt).toContain('## Goal')
    expect(prompt).toContain('Test goal')
  })
})
