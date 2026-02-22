/**
 * Unit tests for api/artifacts/get.ts
 * Tests the behavior of artifact retrieval, including summary mode helpers.
 */

import { describe, it, expect } from 'vitest'
import { isArtifactBlank, extractSnippet } from './get.js'

describe('isArtifactBlank', () => {
  it('returns true for empty or null body_md', () => {
    expect(isArtifactBlank(null, 'Test Title')).toBe(true)
    expect(isArtifactBlank(undefined, 'Test Title')).toBe(true)
    expect(isArtifactBlank('', 'Test Title')).toBe(true)
    expect(isArtifactBlank('   ', 'Test Title')).toBe(true)
  })

  it('returns true for body_md with only headings and no substantial content', () => {
    const onlyHeadings = '# Title\n## Subtitle\n### Section'
    expect(isArtifactBlank(onlyHeadings, 'Test Title')).toBe(true)
  })

  it('returns true for body_md with only list items and no substantial content', () => {
    const onlyLists = '- Item 1\n- Item 2\n* Item 3'
    expect(isArtifactBlank(onlyLists, 'Test Title')).toBe(true)
  })

  it('returns true for body_md with less than 30 characters after removing headings and lists', () => {
    const shortContent = '# Title\n\nShort text here'
    expect(isArtifactBlank(shortContent, 'Test Title')).toBe(true)
  })

  it('returns true for body_md matching placeholder patterns', () => {
    expect(isArtifactBlank('# Title\n\nTODO', 'Test Title')).toBe(true)
    expect(isArtifactBlank('# Title\n\nTBD', 'Test Title')).toBe(true)
    expect(isArtifactBlank('# Title\n\nplaceholder', 'Test Title')).toBe(true)
    expect(isArtifactBlank('# Title\n\ncoming soon', 'Test Title')).toBe(true)
    expect(isArtifactBlank('TODO: Add content', 'Test Title')).toBe(true)
  })

  it('returns false for body_md with substantial content', () => {
    // Content without heading at start to avoid placeholder pattern match
    const substantialContent = 'This is a substantial piece of content that contains enough text to be considered non-blank. It has more than 30 characters and is not just a placeholder. The content provides meaningful information.'
    expect(isArtifactBlank(substantialContent, 'Test Title')).toBe(false)
  })

  it('returns false for body_md with headings and substantial content', () => {
    // Content with heading but substantial text after (not matching placeholder patterns)
    // Must have content on same line as heading or immediately after to avoid /^#\s+[^\n]+\n*$/m pattern
    const withHeadings = '## Title\n\nThis is substantial content that provides real information about the artifact. It contains multiple sentences and meaningful text that goes beyond just headings and placeholders. The content is long enough to pass the 30 character threshold after removing headings.'
    expect(isArtifactBlank(withHeadings, 'Test Title')).toBe(false)
  })
})

describe('extractSnippet', () => {
  it('returns empty string for null or undefined body_md', () => {
    expect(extractSnippet(null)).toBe('')
    expect(extractSnippet(undefined)).toBe('')
  })

  it('returns empty string for body_md with only headings', () => {
    const onlyHeadings = '# Title\n## Subtitle\n### Section'
    expect(extractSnippet(onlyHeadings)).toBe('')
  })

  it('extracts first 200 characters when content is longer', () => {
    const longContent = 'This is a very long piece of content. '.repeat(20)
    const snippet = extractSnippet(longContent)
    expect(snippet.length).toBeLessThanOrEqual(203) // 200 chars + '...'
    expect(snippet).toContain('This is a very long')
  })

  it('truncates at word boundary when last space is between 150 and 200 characters', () => {
    const content = 'Word '.repeat(50) + 'EndWord'
    const snippet = extractSnippet(content)
    expect(snippet).toMatch(/\.\.\.$/)
    // Should truncate at a word boundary
    expect(snippet.lastIndexOf(' ')).toBeGreaterThan(150)
    expect(snippet.lastIndexOf(' ')).toBeLessThan(200)
  })

  it('returns full content with ellipsis when content is slightly longer than 200 chars', () => {
    const content = 'A'.repeat(250)
    const snippet = extractSnippet(content)
    expect(snippet).toMatch(/\.\.\.$/)
    expect(snippet.length).toBe(203) // 200 + '...'
  })

  it('returns content without ellipsis when content is 200 chars or less', () => {
    const shortContent = 'Short content here'
    const snippet = extractSnippet(shortContent)
    expect(snippet).toBe(shortContent)
    expect(snippet).not.toContain('...')
  })

  it('removes headings before extracting snippet', () => {
    const contentWithHeadings = '# Title\n## Subtitle\n\nThis is the actual content that should appear in the snippet. It contains meaningful text that is not just headings.'
    const snippet = extractSnippet(contentWithHeadings)
    expect(snippet).not.toContain('# Title')
    expect(snippet).not.toContain('## Subtitle')
    expect(snippet).toContain('This is the actual content')
  })
})
