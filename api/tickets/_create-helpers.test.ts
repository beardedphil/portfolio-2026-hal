import { describe, it, expect } from 'vitest'
import {
  generateSingleSuggestionBody,
  generateMultipleSuggestionsBody,
} from './_create-helpers.js'

describe('generateSingleSuggestionBody', () => {
  it('generates body with source reference', () => {
    const body = generateSingleSuggestionBody('HAL-0123', 'Test suggestion', '')
    expect(body).toContain('HAL-0123')
    expect(body).toContain('Test suggestion')
  })

  it('includes idempotency section when provided', () => {
    const idempotency = 'Suggestion Hash**: abc123'
    const body = generateSingleSuggestionBody('HAL-0123', 'Test', idempotency)
    expect(body).toContain(idempotency)
  })

  it('includes standard sections', () => {
    const body = generateSingleSuggestionBody('HAL-0123', 'Test', '')
    expect(body).toContain('## Goal (one sentence)')
    expect(body).toContain('## Acceptance criteria (UI-only)')
    expect(body).toContain('## Constraints')
  })

  it('includes implementation notes', () => {
    const body = generateSingleSuggestionBody('HAL-0123', 'Test', '')
    expect(body).toContain('HAL-0123')
    expect(body).toContain('Process Review suggestion')
  })
})

describe('generateMultipleSuggestionsBody', () => {
  it('generates body with source reference', () => {
    const body = generateMultipleSuggestionsBody('HAL-0123', 'Suggestion 1\nSuggestion 2', '')
    expect(body).toContain('HAL-0123')
  })

  it('includes suggestion text', () => {
    const suggestions = 'Suggestion 1\nSuggestion 2'
    const body = generateMultipleSuggestionsBody('HAL-0123', suggestions, '')
    expect(body).toContain('Suggestion 1')
    expect(body).toContain('Suggestion 2')
  })

  it('includes idempotency section when provided', () => {
    const idempotency = 'Suggestion Hash**: abc123'
    const body = generateMultipleSuggestionsBody('HAL-0123', 'Test', idempotency)
    expect(body).toContain(idempotency)
  })

  it('includes suggested improvements section', () => {
    const body = generateMultipleSuggestionsBody('HAL-0123', 'Test suggestions', '')
    expect(body).toContain('## Suggested improvements')
  })

  it('includes standard sections', () => {
    const body = generateMultipleSuggestionsBody('HAL-0123', 'Test', '')
    expect(body).toContain('## Goal (one sentence)')
    expect(body).toContain('## Acceptance criteria (UI-only)')
  })
})
