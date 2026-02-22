/**
 * Unit tests for api/artifacts/get.ts helper functions.
 * Tests the behavior being refactored to ensure equivalence.
 */

import { describe, it, expect } from 'vitest'
import {
  isArtifactBlank,
  extractSnippet,
  parseTicketNumber,
  isRetryableError,
} from './get-helpers.js'

describe('isArtifactBlank', () => {
  it('returns true for empty or null body_md', () => {
    expect(isArtifactBlank(null, 'Test Title')).toBe(true)
    expect(isArtifactBlank(undefined, 'Test Title')).toBe(true)
    expect(isArtifactBlank('', 'Test Title')).toBe(true)
    expect(isArtifactBlank('   ', 'Test Title')).toBe(true)
  })

  it('returns true for body with only headings and bullets', () => {
    const bodyWithOnlyHeadings = `# Title

## Section

- Item 1
- Item 2
`
    expect(isArtifactBlank(bodyWithOnlyHeadings, 'Test Title')).toBe(true)
  })

  it('returns true for body with less than 30 characters of content', () => {
    const shortBody = `# Title

This is short.`
    expect(isArtifactBlank(shortBody, 'Test Title')).toBe(true)
  })

  it('returns true for placeholder patterns', () => {
    expect(isArtifactBlank('# Title\n', 'Test Title')).toBe(true)
    expect(isArtifactBlank('# Title\n\nTODO', 'Test Title')).toBe(true)
    expect(isArtifactBlank('TBD', 'Test Title')).toBe(true)
    expect(isArtifactBlank('placeholder', 'Test Title')).toBe(true)
    expect(isArtifactBlank('Coming soon', 'Test Title')).toBe(true)
    expect(isArtifactBlank('Not yet', 'Test Title')).toBe(true)
    expect(isArtifactBlank('To be determined', 'Test Title')).toBe(true)
  })

  it('returns false for substantive content', () => {
    const substantive = `This is a substantial artifact with enough content to be considered non-blank.
It contains multiple sentences and paragraphs that provide meaningful information.
The content here is detailed and provides value to the reader.
This paragraph adds even more content to ensure we exceed the minimum threshold.
`
    expect(isArtifactBlank(substantive, 'Test Title')).toBe(false)
  })

  it('handles case-insensitive placeholder matching', () => {
    expect(isArtifactBlank('todo', 'Test Title')).toBe(true)
    expect(isArtifactBlank('TBD', 'Test Title')).toBe(true)
    expect(isArtifactBlank('PLACEHOLDER', 'Test Title')).toBe(true)
  })
})

describe('extractSnippet', () => {
  it('returns empty string for null or undefined body_md', () => {
    expect(extractSnippet(null)).toBe('')
    expect(extractSnippet(undefined)).toBe('')
  })

  it('returns empty string for body with only headings', () => {
    const bodyWithOnlyHeadings = `# Title

## Section

### Subsection
`
    expect(extractSnippet(bodyWithOnlyHeadings)).toBe('')
  })

  it('extracts first 200 characters when content is longer', () => {
    const longContent = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(10)
    const snippet = extractSnippet(longContent)
    expect(snippet.length).toBeLessThanOrEqual(203) // 200 + '...'
    expect(snippet).toContain('Lorem ipsum')
    expect(snippet.endsWith('...')).toBe(true)
  })

  it('truncates at word boundary when possible', () => {
    const content = 'Word '.repeat(100) // Creates content with spaces
    const snippet = extractSnippet(content)
    // Should truncate at a space, not mid-word
    expect(snippet.endsWith('...')).toBe(true)
    const lastWord = snippet.replace('...', '').trim().split(' ').pop()
    expect(lastWord).toBeTruthy()
    expect(lastWord?.length).toBeGreaterThan(0)
  })

  it('returns full content when shorter than 200 characters', () => {
    const shortContent = 'This is a short artifact body that is less than 200 characters.'
    expect(extractSnippet(shortContent)).toBe(shortContent)
  })

  it('removes headings before extracting snippet', () => {
    const contentWithHeadings = `# Title

This is the actual content that should be extracted as a snippet.
It should not include the heading above.

## Another Section

More content here.`
    const snippet = extractSnippet(contentWithHeadings)
    expect(snippet).not.toContain('# Title')
    expect(snippet).not.toContain('## Another Section')
    expect(snippet).toContain('This is the actual content')
  })
})

describe('parseTicketNumber', () => {
  it('parses valid numeric ticket IDs', () => {
    expect(parseTicketNumber('123')).toBe(123)
    expect(parseTicketNumber('0121')).toBe(121)
    expect(parseTicketNumber('0')).toBe(0)
  })

  it('returns null for invalid ticket IDs', () => {
    expect(parseTicketNumber('abc')).toBe(null)
    expect(parseTicketNumber('HAL-0121')).toBe(null)
    expect(parseTicketNumber('')).toBe(null)
    expect(parseTicketNumber('12.5')).toBe(null)
    expect(parseTicketNumber('12abc')).toBe(null)
  })

  it('handles edge cases', () => {
    expect(parseTicketNumber('123')).toBe(123)
    expect(parseTicketNumber('  123  ')).toBe(123) // parseInt trims
  })
})

describe('isRetryableError', () => {
  it('returns true for timeout errors', () => {
    expect(isRetryableError({ message: 'timeout occurred' })).toBe(true)
    expect(isRetryableError({ message: 'Request timeout' })).toBe(true)
  })

  it('returns true for network errors', () => {
    expect(isRetryableError({ message: 'network error' })).toBe(true)
    expect(isRetryableError({ message: 'Network failure' })).toBe(true)
  })

  it('returns true for connection errors', () => {
    expect(isRetryableError({ message: 'ECONNREFUSED' })).toBe(true)
    expect(isRetryableError({ message: 'ETIMEDOUT' })).toBe(true)
  })

  it('returns true for PostgREST connection errors', () => {
    expect(isRetryableError({ code: 'PGRST116' })).toBe(true)
  })

  it('returns false for validation errors', () => {
    expect(isRetryableError({ message: 'Invalid input' })).toBe(false)
    expect(isRetryableError({ message: 'Validation failed' })).toBe(false)
  })

  it('returns false for errors without message or code', () => {
    expect(isRetryableError({})).toBe(false)
    expect(isRetryableError(null)).toBe(false)
  })
})
