/**
 * Unit tests for api/artifacts/get.ts helper functions.
 * Tests the behavior of isArtifactBlank and extractSnippet functions.
 */

import { describe, it, expect } from 'vitest'
import { isArtifactBlank, extractSnippet } from './get.js'

describe('isArtifactBlank', () => {
  it('returns true for null or undefined body_md', () => {
    expect(isArtifactBlank(null, 'Test Title')).toBe(true)
    expect(isArtifactBlank(undefined, 'Test Title')).toBe(true)
  })

  it('returns true for empty string body_md', () => {
    expect(isArtifactBlank('', 'Test Title')).toBe(true)
    expect(isArtifactBlank('   ', 'Test Title')).toBe(true)
    expect(isArtifactBlank('\n\n  \n', 'Test Title')).toBe(true)
  })

  it('returns true for body_md with only headings', () => {
    expect(isArtifactBlank('# Title', 'Test Title')).toBe(true)
    expect(isArtifactBlank('## Section\n### Subsection', 'Test Title')).toBe(true)
  })

  it('returns true for body_md with only list items', () => {
    expect(isArtifactBlank('- Item 1\n- Item 2', 'Test Title')).toBe(true)
    expect(isArtifactBlank('* Item 1\n* Item 2', 'Test Title')).toBe(true)
    expect(isArtifactBlank('1. Item 1\n2. Item 2', 'Test Title')).toBe(true)
  })

  it('returns true for body_md with only headings and lists', () => {
    expect(isArtifactBlank('# Title\n- Item 1\n- Item 2', 'Test Title')).toBe(true)
    expect(isArtifactBlank('## Section\n1. First\n2. Second', 'Test Title')).toBe(true)
  })

  it('returns true for body_md shorter than 30 characters after removing headings and lists', () => {
    expect(isArtifactBlank('Short text', 'Test Title')).toBe(true)
    expect(isArtifactBlank('# Title\n\nVery short', 'Test Title')).toBe(true)
    expect(isArtifactBlank('This is a very short text', 'Test Title')).toBe(true)
  })

  it('returns true for placeholder patterns', () => {
    expect(isArtifactBlank('# Title\n\nTODO', 'Test Title')).toBe(true)
    expect(isArtifactBlank('# Title\n\nTBD', 'Test Title')).toBe(true)
    expect(isArtifactBlank('# Title\n\nplaceholder', 'Test Title')).toBe(true)
    expect(isArtifactBlank('# Title\n\ncoming soon', 'Test Title')).toBe(true)
    expect(isArtifactBlank('# Title\n\nnot yet', 'Test Title')).toBe(true)
    expect(isArtifactBlank('# Title\n\nto be determined', 'Test Title')).toBe(true)
  })

  it('returns true for placeholder patterns at start of content', () => {
    expect(isArtifactBlank('TODO: implement this', 'Test Title')).toBe(true)
    expect(isArtifactBlank('TBD', 'Test Title')).toBe(true)
    expect(isArtifactBlank('placeholder', 'Test Title')).toBe(true)
  })

  it('returns false for substantial content', () => {
    const substantialContent = 'This is a substantial artifact body with enough content to be considered non-blank. It has multiple sentences and provides meaningful information.'
    expect(isArtifactBlank(substantialContent, 'Test Title')).toBe(false)
  })

  it('returns false for content with headings but also substantial text', () => {
    const contentWithHeadings = '# Title\n\nThis is a substantial artifact body with enough content to be considered non-blank. It has multiple sentences and provides meaningful information about the implementation.'
    expect(isArtifactBlank(contentWithHeadings, 'Test Title')).toBe(false)
  })

  it('returns false for content with lists but also substantial text', () => {
    const contentWithLists = '- First item\n- Second item\n\nThis is a substantial artifact body with enough content to be considered non-blank. It has multiple sentences and provides meaningful information.'
    expect(isArtifactBlank(contentWithLists, 'Test Title')).toBe(false)
  })

  it('handles case-insensitive placeholder matching', () => {
    expect(isArtifactBlank('# Title\n\ntodo', 'Test Title')).toBe(true)
    expect(isArtifactBlank('# Title\n\nTBD', 'Test Title')).toBe(true)
    expect(isArtifactBlank('# Title\n\nPLACEHOLDER', 'Test Title')).toBe(true)
    expect(isArtifactBlank('# Title\n\nComing Soon', 'Test Title')).toBe(true)
  })
})

describe('extractSnippet', () => {
  it('returns empty string for null or undefined body_md', () => {
    expect(extractSnippet(null)).toBe('')
    expect(extractSnippet(undefined)).toBe('')
  })

  it('returns empty string for body_md with only headings', () => {
    expect(extractSnippet('# Title')).toBe('')
    expect(extractSnippet('## Section\n### Subsection')).toBe('')
  })

  it('returns content without headings', () => {
    const content = '# Title\n\nThis is the actual content that should be extracted.'
    expect(extractSnippet(content)).toBe('This is the actual content that should be extracted.')
  })

  it('returns first 200 characters when content is longer', () => {
    const longContent = 'This is a very long content that exceeds two hundred characters in length. It should be truncated to exactly two hundred characters or less, and if there is a space near the end, it should be cut at that space to avoid cutting words in half.'
    const snippet = extractSnippet(longContent)
    // When truncating at a space between 150-200, result includes ellipsis (max 200 chars total)
    expect(snippet.length).toBeLessThanOrEqual(200)
    expect(snippet).toContain('This is a very long content')
    expect(snippet).toContain('...')
  })

  it('truncates at last space between 150 and 200 characters when possible', () => {
    // Create content where last space in first 200 chars is between 150-200
    // 150 A's + space + 50 B's = 201 chars, so last space in first 200 is at position 150
    const longContent = 'A'.repeat(150) + ' ' + 'B'.repeat(100) + ' ' + 'C'.repeat(100)
    const snippet = extractSnippet(longContent)
    // Should truncate at a space and add ellipsis
    expect(snippet).toContain('...')
    expect(snippet.length).toBeLessThanOrEqual(200)
    expect(snippet.endsWith('...')).toBe(true)
    // Should truncate at word boundary (space), not in middle of word
    // The snippet should end with '...' and not have '...' in the middle
    const ellipsisCount = (snippet.match(/\.\.\./g) || []).length
    expect(ellipsisCount).toBe(1)
    expect(snippet.endsWith('...')).toBe(true)
  })

  it('adds ellipsis when content is truncated', () => {
    const longContent = 'This is a very long content that exceeds two hundred characters in length. It should be truncated and an ellipsis should be added to indicate that there is more content available beyond what is shown in the snippet.'
    const snippet = extractSnippet(longContent)
    expect(snippet).toContain('...')
    expect(snippet.length).toBeLessThanOrEqual(203) // 200 + '...'
  })

  it('does not add ellipsis when content is not truncated', () => {
    const shortContent = 'This is short content that does not need truncation.'
    const snippet = extractSnippet(shortContent)
    expect(snippet).not.toContain('...')
    expect(snippet).toBe(shortContent)
  })

  it('handles content with multiple headings', () => {
    const content = '# First Title\n\nFirst paragraph.\n\n## Second Title\n\nSecond paragraph with more content.'
    const snippet = extractSnippet(content)
    expect(snippet).not.toContain('#')
    expect(snippet).toContain('First paragraph')
    expect(snippet).toContain('Second paragraph')
  })

  it('preserves formatting within the snippet', () => {
    const content = '# Title\n\nThis is a paragraph with **bold** text and *italic* text that should be preserved in the snippet.'
    const snippet = extractSnippet(content)
    expect(snippet).toContain('**bold**')
    expect(snippet).toContain('*italic*')
  })

  it('handles edge case of exactly 200 characters', () => {
    const exact200 = 'A'.repeat(200)
    const snippet = extractSnippet(exact200)
    expect(snippet.length).toBe(200)
    expect(snippet).not.toContain('...')
  })

  it('handles content that is just over 200 characters', () => {
    const justOver200 = 'A'.repeat(201)
    const snippet = extractSnippet(justOver200)
    expect(snippet.length).toBeLessThanOrEqual(203) // 200 + '...'
    expect(snippet).toContain('...')
  })
})
