/**
 * Unit tests for artifact summary helper functions.
 * Tests the behavior extracted from get.ts for summary mode.
 */

import { describe, it, expect } from 'vitest'
import { isArtifactBlank, extractSnippet } from './_summary-helpers.js'

describe('isArtifactBlank', () => {
  it('returns true for empty body_md', () => {
    expect(isArtifactBlank(null, 'Test Title')).toBe(true)
    expect(isArtifactBlank(undefined, 'Test Title')).toBe(true)
    expect(isArtifactBlank('', 'Test Title')).toBe(true)
    expect(isArtifactBlank('   ', 'Test Title')).toBe(true)
  })

  it('returns true for body_md with only headings and list items', () => {
    const onlyHeadings = '# Title\n## Subtitle\n### Section'
    expect(isArtifactBlank(onlyHeadings, 'Test Title')).toBe(true)

    const onlyListItems = '- Item 1\n- Item 2\n* Item 3'
    expect(isArtifactBlank(onlyListItems, 'Test Title')).toBe(true)

    const onlyNumberedList = '1. Item 1\n2. Item 2\n3. Item 3'
    expect(isArtifactBlank(onlyNumberedList, 'Test Title')).toBe(true)
  })

  it('returns true for body_md shorter than 30 characters after removing headings', () => {
    const shortContent = '# Title\n\nShort text'
    expect(isArtifactBlank(shortContent, 'Test Title')).toBe(true)

    const veryShort = 'This is too short'
    expect(isArtifactBlank(veryShort, 'Test Title')).toBe(true)
  })

  it('returns true for placeholder patterns', () => {
    const todoPattern = '# Title\n\nTODO: Add content'
    expect(isArtifactBlank(todoPattern, 'Test Title')).toBe(true)

    const tbdPattern = 'TBD: Content to be determined'
    expect(isArtifactBlank(tbdPattern, 'Test Title')).toBe(true)

    const placeholderPattern = '# Title\n\nplaceholder text here'
    expect(isArtifactBlank(placeholderPattern, 'Test Title')).toBe(true)

    const comingSoonPattern = 'Coming soon: More content will be added'
    expect(isArtifactBlank(comingSoonPattern, 'Test Title')).toBe(true)
  })

  it('returns false for substantive content', () => {
    const substantive = '# Title\n\nThis is substantive content that is longer than 30 characters and contains real information about the artifact. It has enough text to pass the minimum length requirement.'
    expect(isArtifactBlank(substantive, 'Test Title')).toBe(false)

    const withHeadings = '# Title\n\n## Section\n\nThis is substantive content that provides meaningful information about the artifact and its purpose. This text is definitely long enough to be considered substantive.'
    expect(isArtifactBlank(withHeadings, 'Test Title')).toBe(false)
  })
})

describe('extractSnippet', () => {
  it('returns empty string for null or undefined body_md', () => {
    expect(extractSnippet(null)).toBe('')
    expect(extractSnippet(undefined)).toBe('')
    expect(extractSnippet('')).toBe('')
  })

  it('returns empty string for body_md with only headings', () => {
    const onlyHeadings = '# Title\n## Subtitle\n### Section'
    expect(extractSnippet(onlyHeadings)).toBe('')
  })

  it('extracts snippet up to 200 characters, breaking at word boundary when possible', () => {
    const longText = 'This is a very long text that exceeds 200 characters. '.repeat(10)
    const snippet = extractSnippet(longText)
    
    expect(snippet.length).toBeLessThanOrEqual(203) // 200 + '...'
    expect(snippet).toContain('...')
    // Should break at word boundary (last space before 200)
    const lastSpaceIndex = snippet.lastIndexOf(' ')
    expect(lastSpaceIndex).toBeGreaterThan(150)
  })

  it('returns full text with ellipsis when text is slightly longer than snippet', () => {
    const text = 'A'.repeat(250)
    const snippet = extractSnippet(text)
    
    expect(snippet.length).toBe(203) // 200 + '...'
    expect(snippet).toContain('...')
  })

  it('removes headings before extracting snippet', () => {
    const withHeadings = '# Title\n\n## Section\n\nThis is the actual content that should appear in the snippet.'
    const snippet = extractSnippet(withHeadings)
    
    expect(snippet).not.toContain('# Title')
    expect(snippet).not.toContain('## Section')
    expect(snippet).toContain('This is the actual content')
  })

  it('returns snippet without ellipsis when text is exactly 200 characters or less', () => {
    const exact200 = 'A'.repeat(200)
    const snippet = extractSnippet(exact200)
    
    expect(snippet).toBe(exact200)
    expect(snippet).not.toContain('...')
  })
})
