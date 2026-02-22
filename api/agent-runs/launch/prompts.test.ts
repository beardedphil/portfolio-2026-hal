/**
 * Unit tests for launch/prompts.ts
 * 
 * These tests verify prompt building functions:
 * - buildImplementationPrompt: implementation agent prompt structure
 * - buildQAPrompt: QA agent prompt structure
 */

import { describe, it, expect } from 'vitest'
import { buildImplementationPrompt, buildQAPrompt } from './prompts.js'

describe('buildImplementationPrompt', () => {
  it('builds correct prompt structure for implementation agent', () => {
    const prompt = buildImplementationPrompt(
      'test/repo',
      123,
      'HAL-0123',
      'col-doing',
      'main',
      'https://example.com',
      {
        goal: 'Add feature',
        deliverable: 'User sees button',
        criteria: '- [ ] Button visible',
      }
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
    expect(prompt).toContain('Add feature')
    expect(prompt).toContain('## Human-verifiable deliverable')
    expect(prompt).toContain('User sees button')
    expect(prompt).toContain('## Acceptance criteria')
    expect(prompt).toContain('- [ ] Button visible')
  })

  it('uses default column ID when currentColumnId is null', () => {
    const prompt = buildImplementationPrompt(
      'test/repo',
      123,
      'HAL-0123',
      null,
      'main',
      'https://example.com',
      {
        goal: 'Add feature',
        deliverable: 'User sees button',
        criteria: '- [ ] Button visible',
      }
    )

    expect(prompt).toContain('**currentColumnId**: col-unassigned')
  })

  it('uses "(not specified)" for missing goal, deliverable, or criteria', () => {
    const prompt = buildImplementationPrompt(
      'test/repo',
      123,
      'HAL-0123',
      'col-doing',
      'main',
      'https://example.com',
      {
        goal: '',
        deliverable: '',
        criteria: '',
      }
    )

    expect(prompt).toContain('## Goal\n(not specified)')
    expect(prompt).toContain('## Human-verifiable deliverable\n(not specified)')
    expect(prompt).toContain('## Acceptance criteria\n(not specified)')
  })
})

describe('buildQAPrompt', () => {
  it('builds correct prompt structure for QA agent', () => {
    const prompt = buildQAPrompt(
      'test/repo',
      123,
      'HAL-0123',
      'col-qa',
      'main',
      'https://example.com',
      {
        goal: 'Add feature',
        deliverable: 'User sees button',
        criteria: '- [ ] Button visible',
      }
    )

    expect(prompt).toContain('QA this ticket implementation.')
    expect(prompt).toContain('**agentType**: qa')
    expect(prompt).toContain('**repoFullName**: test/repo')
    expect(prompt).toContain('**ticketNumber**: 123')
    expect(prompt).toContain('**displayId**: HAL-0123')
    expect(prompt).toContain('**currentColumnId**: col-qa')
    expect(prompt).toContain('## MANDATORY: Load Your Instructions First')
    expect(prompt).toContain('## Goal')
    expect(prompt).toContain('Add feature')
  })

  it('includes instructions loading section for QA agent', () => {
    const prompt = buildQAPrompt(
      'test/repo',
      123,
      'HAL-0123',
      'col-qa',
      'main',
      'https://example.com',
      {
        goal: 'Add feature',
        deliverable: 'User sees button',
        criteria: '- [ ] Button visible',
      }
    )

    expect(prompt).toContain('**BEFORE starting any QA work, you MUST load your basic instructions from Supabase.**')
    expect(prompt).toContain('const baseUrl = process.env.HAL_API_URL')
    expect(prompt).toContain('agentType: \'qa\'')
    expect(prompt).toContain('/api/instructions/get')
  })

  it('includes all required QA workflow information', () => {
    const prompt = buildQAPrompt(
      'test/repo',
      123,
      'HAL-0123',
      'col-qa',
      'main',
      'https://example.com',
      {
        goal: 'Add feature',
        deliverable: 'User sees button',
        criteria: '- [ ] Button visible',
      }
    )

    expect(prompt).toContain('Required implementation artifacts you must verify before starting QA')
    expect(prompt).toContain('How to structure and store QA reports')
    expect(prompt).toContain('When to pass/fail tickets')
    expect(prompt).toContain('How to move tickets after QA')
    expect(prompt).toContain('Code citation requirements')
  })
})
