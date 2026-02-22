import { describe, it, expect } from 'vitest'
import {
  extractTicketSections,
  determineAgentType,
  generateImplementationBranchName,
  buildImplementationPrompt,
  buildQAPrompt,
} from './launch.js'

describe('launch.ts helper functions', () => {
  describe('extractTicketSections', () => {
    it('extracts goal, deliverable, and criteria from ticket body', () => {
      const bodyMd = `## Goal (one sentence)

Add a feature.

## Human-verifiable deliverable (UI-only)

User sees a button.

## Acceptance criteria (UI-only)

- [ ] Button is visible
- [ ] Button is clickable`

      const result = extractTicketSections(bodyMd)

      expect(result.goal).toBe('Add a feature.')
      expect(result.deliverable).toBe('User sees a button.')
      expect(result.criteria).toBe('- [ ] Button is visible\n- [ ] Button is clickable')
    })

    it('handles missing sections gracefully', () => {
      const bodyMd = `## Goal (one sentence)

Add a feature.`

      const result = extractTicketSections(bodyMd)

      expect(result.goal).toBe('Add a feature.')
      expect(result.deliverable).toBe('')
      expect(result.criteria).toBe('')
    })

    it('handles empty body', () => {
      const result = extractTicketSections('')

      expect(result.goal).toBe('')
      expect(result.deliverable).toBe('')
      expect(result.criteria).toBe('')
    })

    it('handles case-insensitive section headers', () => {
      const bodyMd = `## goal

Test goal

## HUMAN-VERIFIABLE DELIVERABLE

Test deliverable

## acceptance criteria

Test criteria`

      const result = extractTicketSections(bodyMd)

      expect(result.goal).toBe('Test goal')
      expect(result.deliverable).toBe('Test deliverable')
      expect(result.criteria).toBe('Test criteria')
    })
  })

  describe('determineAgentType', () => {
    it('returns "implementation" as default', () => {
      expect(determineAgentType()).toBe('implementation')
      expect(determineAgentType(undefined)).toBe('implementation')
      expect(determineAgentType('invalid')).toBe('implementation')
    })

    it('returns "qa" for qa agent type', () => {
      expect(determineAgentType('qa')).toBe('qa')
    })

    it('returns "project-manager" for project-manager agent type', () => {
      expect(determineAgentType('project-manager')).toBe('project-manager')
    })

    it('returns "process-review" for process-review agent type', () => {
      expect(determineAgentType('process-review')).toBe('process-review')
    })
  })

  describe('generateImplementationBranchName', () => {
    it('pads ticket number to 4 digits', () => {
      expect(generateImplementationBranchName(1)).toBe('ticket/0001-implementation')
      expect(generateImplementationBranchName(42)).toBe('ticket/0042-implementation')
      expect(generateImplementationBranchName(123)).toBe('ticket/0123-implementation')
      expect(generateImplementationBranchName(1234)).toBe('ticket/1234-implementation')
    })

    it('handles large ticket numbers', () => {
      expect(generateImplementationBranchName(12345)).toBe('ticket/12345-implementation')
    })
  })

  describe('buildImplementationPrompt', () => {
    it('builds prompt with all required sections', () => {
      const prompt = buildImplementationPrompt(
        'test/repo',
        123,
        'HAL-0123',
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
      expect(prompt).toContain('**ticketNumber**: 123')
      expect(prompt).toContain('**displayId**: HAL-0123')
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

    it('handles missing ticket sections with placeholders', () => {
      const prompt = buildImplementationPrompt(
        'test/repo',
        123,
        'HAL-0123',
        null,
        'main',
        'https://example.com',
        '',
        '',
        ''
      )

      expect(prompt).toContain('## Goal')
      expect(prompt).toContain('(not specified)')
      expect(prompt).toContain('## Human-verifiable deliverable')
      expect(prompt).toContain('(not specified)')
      expect(prompt).toContain('## Acceptance criteria')
      expect(prompt).toContain('(not specified)')
      expect(prompt).toContain('**currentColumnId**: col-unassigned')
    })
  })

  describe('buildQAPrompt', () => {
    it('builds QA prompt with instructions section', () => {
      const prompt = buildQAPrompt(
        'test/repo',
        123,
        'HAL-0123',
        'col-qa',
        'main',
        'https://example.com',
        'Test goal',
        'Test deliverable',
        'Test criteria'
      )

      expect(prompt).toContain('QA this ticket implementation')
      expect(prompt).toContain('**agentType**: qa')
      expect(prompt).toContain('## MANDATORY: Load Your Instructions First')
      expect(prompt).toContain('api/instructions/get')
      expect(prompt).toContain('## Goal')
      expect(prompt).toContain('Test goal')
    })

    it('includes all required QA-specific instructions', () => {
      const prompt = buildQAPrompt(
        'test/repo',
        123,
        'HAL-0123',
        null,
        'main',
        'https://example.com',
        '',
        '',
        ''
      )

      expect(prompt).toContain('POST /api/artifacts/insert-qa')
      expect(prompt).toContain('Required implementation artifacts')
      expect(prompt).toContain('How to structure and store QA reports')
    })
  })
})
