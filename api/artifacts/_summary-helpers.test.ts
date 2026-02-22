import { describe, it, expect } from 'vitest'
import { isArtifactBlank, extractSnippet } from './_summary-helpers.js'

describe('isArtifactBlank', () => {
  it('returns true for null', () => {
    expect(isArtifactBlank(null, 'Test Title')).toBe(true)
  })

  it('returns true for undefined', () => {
    expect(isArtifactBlank(undefined, 'Test Title')).toBe(true)
  })

  it('returns true for empty string', () => {
    expect(isArtifactBlank('', 'Test Title')).toBe(true)
  })

  it('returns true for whitespace-only', () => {
    expect(isArtifactBlank('   \n\n  ', 'Test Title')).toBe(true)
  })

  it('returns true for content with only headings', () => {
    expect(isArtifactBlank('# Title\n## Subtitle', 'Test Title')).toBe(true)
  })

  it('returns true for content with only list items', () => {
    expect(isArtifactBlank('- Item 1\n- Item 2', 'Test Title')).toBe(true)
  })

  it('returns true for short content after removing headings', () => {
    expect(isArtifactBlank('# Title\n\nShort', 'Test Title')).toBe(true)
  })

  it('returns true for placeholder patterns', () => {
    expect(isArtifactBlank('TODO', 'Test Title')).toBe(true)
    expect(isArtifactBlank('TBD', 'Test Title')).toBe(true)
    expect(isArtifactBlank('placeholder', 'Test Title')).toBe(true)
  })

  it('returns false for substantive content', () => {
    const content = '# Title\n\nThis is substantive content with enough text to pass the blank check.'
    expect(isArtifactBlank(content, 'Test Title')).toBe(false)
  })

  it('returns true for heading followed by placeholder', () => {
    expect(isArtifactBlank('# Title\n\nTODO', 'Test Title')).toBe(true)
  })
})

describe('extractSnippet', () => {
  it('returns empty string for null', () => {
    expect(extractSnippet(null)).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(extractSnippet(undefined)).toBe('')
  })

  it('returns empty string for empty string', () => {
    expect(extractSnippet('')).toBe('')
  })

  it('returns empty string for content with only headings', () => {
    expect(extractSnippet('# Title\n## Subtitle')).toBe('')
  })

  it('extracts snippet from content', () => {
    const content = 'This is some content that should be extracted as a snippet.'
    expect(extractSnippet(content)).toBe(content)
  })

  it('removes headings before extracting', () => {
    const content = '# Title\n\nThis is the actual content.'
    expect(extractSnippet(content)).toBe('This is the actual content.')
  })

  it('truncates long content at word boundary', () => {
    const longContent = 'word '.repeat(100) // ~500 characters
    const snippet = extractSnippet(longContent)
    expect(snippet.length).toBeLessThanOrEqual(203) // 200 + "..."
    expect(snippet).toContain('...')
  })

  it('adds ellipsis when content is truncated', () => {
    const content = 'word '.repeat(100)
    const snippet = extractSnippet(content)
    if (snippet.length < content.length) {
      expect(snippet).toContain('...')
    }
  })

  it('does not add ellipsis when content fits', () => {
    const content = 'Short content'
    const snippet = extractSnippet(content)
    expect(snippet).not.toContain('...')
    expect(snippet).toBe(content)
  })
})
