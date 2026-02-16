/**
 * Unit tests for Process Review ticket-creation idempotency hashing/pattern-building.
 * Tests the logic for computing suggestion hashes and building duplicate detection patterns.
 */

import { describe, it, expect } from 'vitest'
import crypto from 'node:crypto'
import {
  computeSuggestionHash,
  buildHashPattern,
  buildSourcePattern,
} from './_processReviewIdempotency.js'

describe('computeSuggestionHash', () => {
  it('computes 16-character hash from normalized suggestion text', () => {
    const suggestion = 'Add unit tests for Process Review idempotency'
    const hash = computeSuggestionHash(suggestion)
    
    expect(hash).toHaveLength(16)
    expect(typeof hash).toBe('string')
    expect(/^[a-f0-9]{16}$/i.test(hash)).toBe(true)
  })

  it('normalizes suggestion text by trimming before hashing', () => {
    const suggestion1 = '  Add unit tests  '
    const suggestion2 = 'Add unit tests'
    const suggestion3 = '\n\tAdd unit tests\n\t'
    
    const hash1 = computeSuggestionHash(suggestion1)
    const hash2 = computeSuggestionHash(suggestion2)
    const hash3 = computeSuggestionHash(suggestion3)
    
    expect(hash1).toBe(hash2)
    expect(hash2).toBe(hash3)
  })

  it('produces consistent hashes for the same normalized text', () => {
    const suggestion = 'Add unit tests for Process Review idempotency'
    const hash1 = computeSuggestionHash(suggestion)
    const hash2 = computeSuggestionHash(suggestion)
    
    expect(hash1).toBe(hash2)
  })

  it('produces different hashes for different suggestions', () => {
    const suggestion1 = 'Add unit tests'
    const suggestion2 = 'Add integration tests'
    
    const hash1 = computeSuggestionHash(suggestion1)
    const hash2 = computeSuggestionHash(suggestion2)
    
    expect(hash1).not.toBe(hash2)
  })

  it('uses SHA256 and takes first 16 characters', () => {
    const suggestion = 'Test suggestion'
    const hash = computeSuggestionHash(suggestion)
    
    // Manually compute expected hash
    const fullHash = crypto.createHash('sha256').update(suggestion.trim()).digest('hex')
    const expectedHash = fullHash.slice(0, 16)
    
    expect(hash).toBe(expectedHash)
  })

  it('handles empty string after trimming', () => {
    const suggestion = '   '
    const hash = computeSuggestionHash(suggestion)
    
    expect(hash).toHaveLength(16)
    // Empty string should produce a valid hash
    const expectedHash = crypto.createHash('sha256').update('').digest('hex').slice(0, 16)
    expect(hash).toBe(expectedHash)
  })

  it('handles unicode and special characters', () => {
    const suggestion1 = 'Test with émojis 🎉'
    const suggestion2 = 'Test with émojis 🎉'
    
    const hash1 = computeSuggestionHash(suggestion1)
    const hash2 = computeSuggestionHash(suggestion2)
    
    expect(hash1).toBe(hash2)
    expect(hash1).toHaveLength(16)
  })
})

describe('buildHashPattern', () => {
  it('builds pattern for matching suggestion hash in body_md', () => {
    const hash = 'abc123def4567890'
    const pattern = buildHashPattern(hash)
    
    expect(pattern).toBe('Suggestion Hash**: abc123def4567890')
  })

  it('works with any valid 16-character hash', () => {
    const hash = '0123456789abcdef'
    const pattern = buildHashPattern(hash)
    
    expect(pattern).toBe('Suggestion Hash**: 0123456789abcdef')
  })

  it('matches the format used in ticket body_md', () => {
    const hash = 'testhash12345678'
    const pattern = buildHashPattern(hash)
    
    // Should match the format: "- **Suggestion Hash**: <hash>"
    expect(pattern).toContain('Suggestion Hash**')
    expect(pattern).toContain(hash)
  })
})

describe('buildSourcePattern', () => {
  it('builds pattern for matching source reference in body_md', () => {
    const sourceRef = 'HAL-0123'
    const pattern = buildSourcePattern(sourceRef)
    
    expect(pattern).toBe('Proposed from**: HAL-0123 — Process Review')
  })

  it('works with different source reference formats', () => {
    const sourceRef1 = 'HAL-0675'
    const sourceRef2 = '123'
    const sourceRef3 = 'ticket-abc'
    
    const pattern1 = buildSourcePattern(sourceRef1)
    const pattern2 = buildSourcePattern(sourceRef2)
    const pattern3 = buildSourcePattern(sourceRef3)
    
    expect(pattern1).toBe('Proposed from**: HAL-0675 — Process Review')
    expect(pattern2).toBe('Proposed from**: 123 — Process Review')
    expect(pattern3).toBe('Proposed from**: ticket-abc — Process Review')
  })

  it('matches the format used in ticket body_md', () => {
    const sourceRef = 'HAL-0123'
    const pattern = buildSourcePattern(sourceRef)
    
    // Should match the format: "- **Proposed from**: <sourceRef> — Process Review"
    expect(pattern).toContain('Proposed from**')
    expect(pattern).toContain(sourceRef)
    expect(pattern).toContain('Process Review')
  })
})

describe('integration: hash computation and pattern building', () => {
  it('produces patterns that match the actual ticket body format', () => {
    const suggestion = 'Add unit tests for Process Review idempotency'
    const sourceRef = 'HAL-0675'
    
    const hash = computeSuggestionHash(suggestion)
    const hashPattern = buildHashPattern(hash)
    const sourcePattern = buildSourcePattern(sourceRef)
    
    // Simulate the ticket body format
    const bodyMd = `- **Proposed from**: ${sourceRef} — Process Review
- **Suggestion Hash**: ${hash}`
    
    // Patterns should match the body
    expect(bodyMd).toContain(hashPattern)
    expect(bodyMd).toContain(sourcePattern)
  })

  it('ensures hash pattern matches idempotency check logic', () => {
    const suggestion = 'Test suggestion'
    const normalizedSuggestion = suggestion.trim()
    const hash = computeSuggestionHash(normalizedSuggestion)
    const hashPattern = buildHashPattern(hash)
    
    // This should match what checkIdempotency uses
    const expectedHash = crypto.createHash('sha256').update(normalizedSuggestion).digest('hex').slice(0, 16)
    const expectedPattern = `Suggestion Hash**: ${expectedHash}`
    
    expect(hash).toBe(expectedHash)
    expect(hashPattern).toBe(expectedPattern)
  })
})
