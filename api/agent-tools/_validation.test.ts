import { describe, it, expect } from 'vitest'
import {
  validateImplementationArtifactContent,
  validateQaArtifactContent,
} from './_validation.js'

describe('validateImplementationArtifactContent', () => {
  it('returns valid for substantive content', () => {
    const result = validateImplementationArtifactContent('x'.repeat(100), 'Test Title')
    expect(result.valid).toBe(true)
    expect(result.validation_failed).toBeUndefined()
  })

  it('returns invalid for empty content', () => {
    const result = validateImplementationArtifactContent('', 'Test Title')
    expect(result.valid).toBe(false)
    expect(result.validation_failed).toBe(true)
    expect(result.reason).toBeDefined()
  })

  it('returns invalid for short content', () => {
    const result = validateImplementationArtifactContent('Short', 'Test Title')
    expect(result.valid).toBe(false)
    expect(result.validation_failed).toBe(true)
  })

  it('returns invalid for placeholder content', () => {
    const result = validateImplementationArtifactContent('(none)', 'Test Title')
    expect(result.valid).toBe(false)
    expect(result.validation_failed).toBe(true)
  })
})

describe('validateQaArtifactContent', () => {
  it('returns valid for substantive content', () => {
    const result = validateQaArtifactContent('x'.repeat(150), 'QA Report')
    expect(result.valid).toBe(true)
    expect(result.validation_failed).toBeUndefined()
  })

  it('returns invalid for empty content', () => {
    const result = validateQaArtifactContent('', 'QA Report')
    expect(result.valid).toBe(false)
    expect(result.validation_failed).toBe(true)
    expect(result.reason).toBeDefined()
  })

  it('returns invalid for content shorter than 100 characters', () => {
    const result = validateQaArtifactContent('x'.repeat(50), 'QA Report')
    expect(result.valid).toBe(false)
    expect(result.validation_failed).toBe(true)
  })

  it('returns invalid for placeholder content', () => {
    const result = validateQaArtifactContent('TODO', 'QA Report')
    expect(result.valid).toBe(false)
    expect(result.validation_failed).toBe(true)
  })
})
