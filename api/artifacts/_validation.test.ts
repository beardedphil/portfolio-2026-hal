import { describe, it, expect } from 'vitest'
import {
  hasSubstantiveContent,
  hasSubstantiveQAContent,
  isEmptyOrPlaceholder,
} from './_validation.js'

describe('hasSubstantiveContent', () => {
  it('rejects empty content', () => {
    const result = hasSubstantiveContent('', 'Test Title')
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('empty')
  })

  it('rejects whitespace-only content', () => {
    const result = hasSubstantiveContent('   \n\n  ', 'Test Title')
    expect(result.valid).toBe(false)
  })

  it('rejects content shorter than 50 characters', () => {
    const result = hasSubstantiveContent('Short', 'Test Title')
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('too short')
  })

  it('accepts content longer than 50 characters', () => {
    const content = 'x'.repeat(100)
    const result = hasSubstantiveContent(content, 'Test Title')
    expect(result.valid).toBe(true)
  })

  it('rejects placeholder patterns', () => {
    expect(hasSubstantiveContent('TODO', 'Test Title').valid).toBe(false)
    expect(hasSubstantiveContent('TBD', 'Test Title').valid).toBe(false)
    expect(hasSubstantiveContent('placeholder', 'Test Title').valid).toBe(false)
    expect(hasSubstantiveContent('(none)', 'Test Title').valid).toBe(false)
  })

  it('rejects "(No files changed in this PR)" placeholder', () => {
    const result = hasSubstantiveContent('(No files changed in this PR)', 'Test Title')
    expect(result.valid).toBe(false)
  })

  it('handles Changed Files artifacts with valid "No files changed" format', () => {
    const content = 'No files changed. This is a test ticket with no code changes, only documentation updates.'
    const result = hasSubstantiveContent(content, 'Changed Files for ticket 123')
    expect(result.valid).toBe(true)
  })

  it('rejects Changed Files with placeholder format', () => {
    const result = hasSubstantiveContent('(No files changed in this PR)', 'Changed Files for ticket 123')
    expect(result.valid).toBe(false)
  })

  it('requires file listing for Changed Files when files exist', () => {
    const content = '## Modified\n\n' // Just heading, no files
    const result = hasSubstantiveContent(content, 'Changed Files for ticket 123')
    expect(result.valid).toBe(false)
  })

  it('handles Verification artifacts', () => {
    const content = '## Verification\n\n- [x] Test 1\n\nAdditional verification notes and details about the testing process.'
    const result = hasSubstantiveContent(content, 'Verification for ticket 123')
    expect(result.valid).toBe(true)
  })

  it('rejects Verification with only checkboxes', () => {
    const content = '## Verification\n\n- [x] Test 1\n- [ ] Test 2'
    const result = hasSubstantiveContent(content, 'Verification for ticket 123')
    expect(result.valid).toBe(false)
  })
})

describe('hasSubstantiveQAContent', () => {
  it('rejects empty content', () => {
    const result = hasSubstantiveQAContent('', 'QA Report')
    expect(result.valid).toBe(false)
  })

  it('rejects content shorter than 100 characters', () => {
    const result = hasSubstantiveQAContent('x'.repeat(50), 'QA Report')
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('too short')
  })

  it('accepts content longer than 100 characters', () => {
    const content = 'x'.repeat(150)
    const result = hasSubstantiveQAContent(content, 'QA Report')
    expect(result.valid).toBe(true)
  })

  it('rejects obvious placeholder patterns', () => {
    expect(hasSubstantiveQAContent('TODO', 'QA Report').valid).toBe(false)
    expect(hasSubstantiveQAContent('TBD', 'QA Report').valid).toBe(false)
  })

  it('accepts valid QA report content', () => {
    const content = 'This is a comprehensive QA report with detailed findings and verification steps. ' + 'x'.repeat(100)
    const result = hasSubstantiveQAContent(content, 'QA Report')
    expect(result.valid).toBe(true)
  })
})

describe('isEmptyOrPlaceholder', () => {
  it('returns true for empty content', () => {
    expect(isEmptyOrPlaceholder('', 'Test Title')).toBe(true)
    expect(isEmptyOrPlaceholder(null, 'Test Title')).toBe(true)
    expect(isEmptyOrPlaceholder(undefined, 'Test Title')).toBe(true)
  })

  it('returns true for placeholder content', () => {
    expect(isEmptyOrPlaceholder('(none)', 'Test Title')).toBe(true)
    expect(isEmptyOrPlaceholder('TODO', 'Test Title')).toBe(true)
  })

  it('returns false for substantive content', () => {
    expect(isEmptyOrPlaceholder('x'.repeat(100), 'Test Title')).toBe(false)
  })
})
