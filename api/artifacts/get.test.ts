/**
 * Unit tests for api/artifacts/get.ts helper functions.
 * Tests the behavior of isArtifactBlank, extractSnippet, parseRequestBody, lookupTicketPk, fetchArtifacts, and summarizeArtifacts functions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import {
  isArtifactBlank,
  extractSnippet,
  parseRequestBody,
  lookupTicketPk,
  fetchArtifacts,
  summarizeArtifacts,
} from './get.js'

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

describe('parseRequestBody', () => {
  beforeEach(() => {
    // Clear environment variables
    delete process.env.SUPABASE_URL
    delete process.env.VITE_SUPABASE_URL
    delete process.env.SUPABASE_ANON_KEY
    delete process.env.VITE_SUPABASE_ANON_KEY
  })

  it('extracts ticketId and ticketPk from request body', () => {
    const body = {
      ticketId: '123',
      ticketPk: 'pk-456',
      supabaseUrl: 'https://test.supabase.co',
      supabaseAnonKey: 'test-key',
    }
    const result = parseRequestBody(body)
    expect(result.ticketId).toBe('123')
    expect(result.ticketPk).toBe('pk-456')
    expect(result.credentials?.supabaseUrl).toBe('https://test.supabase.co')
    expect(result.credentials?.supabaseAnonKey).toBe('test-key')
    expect(result.summary).toBe(false)
  })

  it('trims whitespace from ticketId and ticketPk', () => {
    const body = {
      ticketId: '  123  ',
      ticketPk: '  pk-456  ',
      supabaseUrl: 'https://test.supabase.co',
      supabaseAnonKey: 'test-key',
    }
    const result = parseRequestBody(body)
    expect(result.ticketId).toBe('123')
    expect(result.ticketPk).toBe('pk-456')
  })

  it('treats empty string ticketId as undefined', () => {
    const body = {
      ticketId: '',
      supabaseUrl: 'https://test.supabase.co',
      supabaseAnonKey: 'test-key',
    }
    const result = parseRequestBody(body)
    expect(result.ticketId).toBeUndefined()
  })

  it('falls back to environment variables for Supabase credentials', () => {
    process.env.SUPABASE_URL = 'https://env.supabase.co'
    process.env.SUPABASE_ANON_KEY = 'env-key'
    const body = {}
    const result = parseRequestBody(body)
    expect(result.credentials?.supabaseUrl).toBe('https://env.supabase.co')
    expect(result.credentials?.supabaseAnonKey).toBe('env-key')
  })

  it('prefers request body credentials over environment variables', () => {
    process.env.SUPABASE_URL = 'https://env.supabase.co'
    process.env.SUPABASE_ANON_KEY = 'env-key'
    const body = {
      supabaseUrl: 'https://body.supabase.co',
      supabaseAnonKey: 'body-key',
    }
    const result = parseRequestBody(body)
    expect(result.credentials?.supabaseUrl).toBe('https://body.supabase.co')
    expect(result.credentials?.supabaseAnonKey).toBe('body-key')
  })

  it('returns undefined credentials when neither body nor env vars are provided', () => {
    const body = {}
    const result = parseRequestBody(body)
    expect(result.credentials).toBeUndefined()
  })

  it('sets summary to true when body.summary is true', () => {
    const body = {
      summary: true,
      supabaseUrl: 'https://test.supabase.co',
      supabaseAnonKey: 'test-key',
    }
    const result = parseRequestBody(body)
    expect(result.summary).toBe(true)
  })

  it('sets summary to false when body.summary is false or missing', () => {
    const body1 = { summary: false, supabaseUrl: 'https://test.supabase.co', supabaseAnonKey: 'test-key' }
    const body2 = { supabaseUrl: 'https://test.supabase.co', supabaseAnonKey: 'test-key' }
    expect(parseRequestBody(body1).summary).toBe(false)
    expect(parseRequestBody(body2).summary).toBe(false)
  })
})

describe('lookupTicketPk', () => {
  it('returns pk when ticket is found on first attempt', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          or: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { pk: 'found-pk' },
              error: null,
            }),
          }),
        }),
      }),
    } as any

    const result = await lookupTicketPk(mockSupabase, '123')
    expect(result).toEqual({ pk: 'found-pk' })
  })

  it('retries on error and succeeds on second attempt', async () => {
    let attemptCount = 0
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          or: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockImplementation(() => {
              attemptCount++
              if (attemptCount === 1) {
                return Promise.resolve({ data: null, error: new Error('Network error') })
              }
              return Promise.resolve({ data: { pk: 'found-pk' }, error: null })
            }),
          }),
        }),
      }),
    } as any

    vi.useFakeTimers()
    const resultPromise = lookupTicketPk(mockSupabase, '123', 3)
    await vi.advanceTimersByTimeAsync(200) // First retry delay
    const result = await resultPromise
    vi.useRealTimers()

    expect(result).toEqual({ pk: 'found-pk' })
  })

  it('returns null when ticket is not found after all retries', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          or: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }),
        }),
      }),
    } as any

    const result = await lookupTicketPk(mockSupabase, '123', 2)
    expect(result).toBeNull()
  })

  it('throws error for invalid non-numeric ticket ID', async () => {
    const mockSupabase = {} as any
    await expect(lookupTicketPk(mockSupabase, 'invalid')).rejects.toThrow('Invalid ticket ID: invalid. Expected numeric ID.')
  })
})

describe('fetchArtifacts', () => {
  it('returns artifacts on first successful attempt', async () => {
    const mockArtifacts = [
      { artifact_id: '1', ticket_pk: 'pk-1', title: 'Test' },
      { artifact_id: '2', ticket_pk: 'pk-1', title: 'Test 2' },
    ]
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: mockArtifacts,
                error: null,
              }),
            }),
          }),
        }),
      }),
    } as any

    const result = await fetchArtifacts(mockSupabase, 'pk-1')
    expect(result.data).toEqual(mockArtifacts)
    expect(result.error).toBeNull()
  })

  it('retries on retryable errors and succeeds on retry', async () => {
    let attemptCount = 0
    const mockArtifacts = [{ artifact_id: '1', ticket_pk: 'pk-1', title: 'Test' }]
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockImplementation(() => {
                attemptCount++
                if (attemptCount === 1) {
                  return Promise.resolve({
                    data: null,
                    error: { message: 'timeout error', code: null },
                  })
                }
                return Promise.resolve({ data: mockArtifacts, error: null })
              }),
            }),
          }),
        }),
      }),
    } as any

    vi.useFakeTimers()
    const resultPromise = fetchArtifacts(mockSupabase, 'pk-1', 3, 100)
    await vi.advanceTimersByTimeAsync(100) // First retry delay
    const result = await resultPromise
    vi.useRealTimers()

    expect(result.data).toEqual(mockArtifacts)
    expect(result.error).toBeNull()
  })

  it('does not retry on non-retryable errors', async () => {
    const nonRetryableError = { message: 'Validation error', code: 'PGRST100' }
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: null,
                error: nonRetryableError,
              }),
            }),
          }),
        }),
      }),
    } as any

    const result = await fetchArtifacts(mockSupabase, 'pk-1', 3)
    expect(result.data).toBeNull()
    expect(result.error).toEqual(nonRetryableError)
  })

  it('returns error after max retries exhausted', async () => {
    const retryableError = { message: 'timeout error', code: null }
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: null,
                error: retryableError,
              }),
            }),
          }),
        }),
      }),
    } as any

    const result = await fetchArtifacts(mockSupabase, 'pk-1', 2)
    expect(result.data).toBeNull()
    expect(result.error).toEqual(retryableError)
  })
})

describe('summarizeArtifacts', () => {
  it('summarizes artifacts with blank detection and snippets', () => {
    const artifacts = [
      {
        artifact_id: '1',
        agent_type: 'implementation',
        title: 'Test Artifact',
        body_md: 'This is a substantial artifact body with enough content to be considered non-blank.',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
      {
        artifact_id: '2',
        agent_type: 'qa',
        title: 'Blank Artifact',
        body_md: 'TODO',
        created_at: '2024-01-02T00:00:00Z',
      },
    ]

    const result = summarizeArtifacts(artifacts)
    expect(result.artifacts).toHaveLength(2)
    expect(result.artifacts[0].is_blank).toBe(false)
    expect(result.artifacts[1].is_blank).toBe(true)
    expect(result.summary.total).toBe(2)
    expect(result.summary.blank).toBe(1)
    expect(result.summary.populated).toBe(1)
  })

  it('uses created_at as updated_at when updated_at is missing', () => {
    const artifacts = [
      {
        artifact_id: '1',
        agent_type: 'implementation',
        title: 'Test',
        body_md: 'Content',
        created_at: '2024-01-01T00:00:00Z',
      },
    ]

    const result = summarizeArtifacts(artifacts)
    expect(result.artifacts[0].updated_at).toBe('2024-01-01T00:00:00Z')
  })

  it('calculates content length correctly', () => {
    const artifacts = [
      {
        artifact_id: '1',
        agent_type: 'implementation',
        title: 'Test',
        body_md: '12345',
        created_at: '2024-01-01T00:00:00Z',
      },
    ]

    const result = summarizeArtifacts(artifacts)
    expect(result.artifacts[0].content_length).toBe(5)
  })

  it('generates snippets correctly', () => {
    const artifacts = [
      {
        artifact_id: '1',
        agent_type: 'implementation',
        title: 'Test',
        body_md: '# Title\n\nThis is the actual content that should be extracted.',
        created_at: '2024-01-01T00:00:00Z',
      },
    ]

    const result = summarizeArtifacts(artifacts)
    expect(result.artifacts[0].snippet).toBe('This is the actual content that should be extracted.')
  })
})
