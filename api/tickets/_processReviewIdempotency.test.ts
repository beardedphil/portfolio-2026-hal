import { describe, it, expect } from 'vitest'
import { computeSuggestionHash, buildHashPattern, buildSourcePattern } from './_processReviewIdempotency.js'

describe('computeSuggestionHash', () => {
  it('computes hash from suggestion text', () => {
    const hash = computeSuggestionHash('Test suggestion')
    expect(hash).toHaveLength(16)
    expect(hash).toMatch(/^[0-9a-f]{16}$/)
  })

  it('trims whitespace before hashing', () => {
    const hash1 = computeSuggestionHash('Test suggestion')
    const hash2 = computeSuggestionHash('  Test suggestion  ')
    expect(hash1).toBe(hash2)
  })

  it('produces consistent hashes for same input', () => {
    const hash1 = computeSuggestionHash('Same suggestion')
    const hash2 = computeSuggestionHash('Same suggestion')
    expect(hash1).toBe(hash2)
  })

  it('produces different hashes for different inputs', () => {
    const hash1 = computeSuggestionHash('Suggestion 1')
    const hash2 = computeSuggestionHash('Suggestion 2')
    expect(hash1).not.toBe(hash2)
  })

  it('handles empty string', () => {
    const hash = computeSuggestionHash('')
    expect(hash).toHaveLength(16)
    expect(hash).toMatch(/^[0-9a-f]{16}$/)
  })

  it('handles long strings', () => {
    const longString = 'A'.repeat(1000)
    const hash = computeSuggestionHash(longString)
    expect(hash).toHaveLength(16)
    expect(hash).toMatch(/^[0-9a-f]{16}$/)
  })
})

describe('buildHashPattern', () => {
  it('builds pattern with hash', () => {
    const hash = 'abc123def456'
    const pattern = buildHashPattern(hash)
    expect(pattern).toBe('Suggestion Hash**: abc123def456')
  })

  it('handles different hash values', () => {
    const hash1 = '1234567890abcdef'
    const hash2 = 'fedcba0987654321'
    expect(buildHashPattern(hash1)).toBe('Suggestion Hash**: 1234567890abcdef')
    expect(buildHashPattern(hash2)).toBe('Suggestion Hash**: fedcba0987654321')
  })
})

describe('buildSourcePattern', () => {
  it('builds pattern with source reference', () => {
    const sourceRef = 'HAL-0123'
    const pattern = buildSourcePattern(sourceRef)
    expect(pattern).toBe('Proposed from**: HAL-0123 — Process Review')
  })

  it('handles different source references', () => {
    expect(buildSourcePattern('HAL-0001')).toBe('Proposed from**: HAL-0001 — Process Review')
    expect(buildSourcePattern('TICKET-999')).toBe('Proposed from**: TICKET-999 — Process Review')
  })

  it('handles source references with special characters', () => {
    const sourceRef = 'ORG/REPO#123'
    const pattern = buildSourcePattern(sourceRef)
    expect(pattern).toBe('Proposed from**: ORG/REPO#123 — Process Review')
  })
})
