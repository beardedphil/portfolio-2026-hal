/**
 * Unit tests for create-tickets.ts utility functions.
 * Tests the behavior being refactored to ensure equivalence after refactoring.
 */

import { describe, it, expect } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'http'
import {
  slugFromTitle,
  repoHintPrefix,
  isUniqueViolation,
  hashSuggestion,
  readJsonBody,
  json,
} from './create-tickets.js'

describe('slugFromTitle', () => {
  it('converts title to lowercase slug', () => {
    expect(slugFromTitle('Hello World')).toBe('hello-world')
    expect(slugFromTitle('My Ticket Title')).toBe('my-ticket-title')
  })

  it('replaces spaces with hyphens', () => {
    expect(slugFromTitle('Multiple   Spaces')).toBe('multiple-spaces')
    expect(slugFromTitle('  Leading and trailing  ')).toBe('leading-and-trailing')
  })

  it('strips non-alphanumeric characters except hyphens', () => {
    expect(slugFromTitle('Ticket #123!')).toBe('ticket-123')
    expect(slugFromTitle('Test@Example.com')).toBe('testexamplecom')
    expect(slugFromTitle('File (v2)')).toBe('file-v2')
  })

  it('collapses multiple hyphens', () => {
    expect(slugFromTitle('Multiple---Hyphens')).toBe('multiple-hyphens')
    expect(slugFromTitle('Test---123')).toBe('test-123')
  })

  it('removes leading and trailing hyphens', () => {
    expect(slugFromTitle('-Leading Hyphen')).toBe('leading-hyphen')
    expect(slugFromTitle('Trailing Hyphen-')).toBe('trailing-hyphen')
    expect(slugFromTitle('-Both-')).toBe('both')
  })

  it('returns "ticket" for empty or whitespace-only input', () => {
    expect(slugFromTitle('')).toBe('ticket')
    expect(slugFromTitle('   ')).toBe('ticket')
    expect(slugFromTitle('---')).toBe('ticket')
    expect(slugFromTitle('!!!')).toBe('ticket')
  })
})

describe('repoHintPrefix', () => {
  it('extracts prefix from simple repo name', () => {
    expect(repoHintPrefix('owner/repo')).toBe('REPO')
    expect(repoHintPrefix('user/my-project')).toBe('MY')
  })

  it('finds 2-6 character token from end', () => {
    expect(repoHintPrefix('owner/portfolio-2026-hal')).toBe('HAL')
    expect(repoHintPrefix('user/test-repo')).toBe('REPO')
    expect(repoHintPrefix('org/my-awesome-project')).toBe('MY')
  })

  it('skips tokens without letters', () => {
    expect(repoHintPrefix('owner/123-456')).toBe('PRJ')
    expect(repoHintPrefix('user/2024-project')).toBe('PROJ')
  })

  it('falls back to first 4 letters if no suitable token', () => {
    expect(repoHintPrefix('owner/123')).toBe('PRJ')
    expect(repoHintPrefix('user/a')).toBe('A')
    expect(repoHintPrefix('org/xyz')).toBe('XYZ')
  })

  it('handles repo name without slash', () => {
    expect(repoHintPrefix('portfolio-2026-hal')).toBe('HAL')
    expect(repoHintPrefix('my-project')).toBe('MY')
  })

  it('handles edge cases', () => {
    expect(repoHintPrefix('')).toBe('PRJ')
    expect(repoHintPrefix('/')).toBe('PRJ')
    expect(repoHintPrefix('a/b')).toBe('B')
  })
})

describe('isUniqueViolation', () => {
  it('returns true for PostgreSQL unique violation code', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true)
    expect(isUniqueViolation({ code: '23505', message: 'Some error' })).toBe(true)
  })

  it('returns true for duplicate key message', () => {
    expect(isUniqueViolation({ message: 'duplicate key value violates unique constraint' })).toBe(true)
    expect(isUniqueViolation({ message: 'Duplicate key error' })).toBe(true)
    expect(isUniqueViolation({ message: 'DUPLICATE KEY' })).toBe(true)
  })

  it('returns true for unique constraint message', () => {
    expect(isUniqueViolation({ message: 'unique constraint violation' })).toBe(true)
    expect(isUniqueViolation({ message: 'Unique constraint error' })).toBe(true)
    expect(isUniqueViolation({ message: 'UNIQUE CONSTRAINT' })).toBe(true)
  })

  it('returns false for null or undefined', () => {
    expect(isUniqueViolation(null)).toBe(false)
    expect(isUniqueViolation(undefined as any)).toBe(false)
  })

  it('returns false for other error codes', () => {
    expect(isUniqueViolation({ code: '23503' })).toBe(false)
    expect(isUniqueViolation({ code: '42P01' })).toBe(false)
    expect(isUniqueViolation({ code: '' })).toBe(false)
  })

  it('returns false for other error messages', () => {
    expect(isUniqueViolation({ message: 'not found' })).toBe(false)
    expect(isUniqueViolation({ message: 'permission denied' })).toBe(false)
    expect(isUniqueViolation({ message: '' })).toBe(false)
  })
})

describe('hashSuggestion', () => {
  it('generates deterministic hash for same inputs', () => {
    const hash1 = hashSuggestion('review-123', 'suggestion text')
    const hash2 = hashSuggestion('review-123', 'suggestion text')
    expect(hash1).toBe(hash2)
    expect(hash1).toHaveLength(16)
  })

  it('generates different hashes for different review IDs', () => {
    const hash1 = hashSuggestion('review-123', 'suggestion text')
    const hash2 = hashSuggestion('review-456', 'suggestion text')
    expect(hash1).not.toBe(hash2)
  })

  it('generates different hashes for different suggestion texts', () => {
    const hash1 = hashSuggestion('review-123', 'suggestion text 1')
    const hash2 = hashSuggestion('review-123', 'suggestion text 2')
    expect(hash1).not.toBe(hash2)
  })

  it('returns 16 character hex string', () => {
    const hash = hashSuggestion('review-123', 'suggestion text')
    expect(hash).toMatch(/^[a-z0-9]{16}$/)
  })

  it('handles empty strings', () => {
    const hash1 = hashSuggestion('', '')
    const hash2 = hashSuggestion('', '')
    expect(hash1).toBe(hash2)
    expect(hash1).toHaveLength(16)
  })

  it('handles special characters in inputs', () => {
    const hash1 = hashSuggestion('review-123', 'suggestion with "quotes" and \'apostrophes\'')
    const hash2 = hashSuggestion('review-123', 'suggestion with "quotes" and \'apostrophes\'')
    expect(hash1).toBe(hash2)
  })
})

describe('readJsonBody', () => {
  it('parses valid JSON body', async () => {
    const mockReq = {
      [Symbol.asyncIterator]: async function* () {
        yield Buffer.from('{"key":"value"}')
      },
    } as unknown as IncomingMessage

    const result = await readJsonBody(mockReq)
    expect(result).toEqual({ key: 'value' })
  })

  it('returns empty object for empty body', async () => {
    const mockReq = {
      [Symbol.asyncIterator]: async function* () {
        yield Buffer.from('')
      },
    } as unknown as IncomingMessage

    const result = await readJsonBody(mockReq)
    expect(result).toEqual({})
  })

  it('returns empty object for whitespace-only body', async () => {
    const mockReq = {
      [Symbol.asyncIterator]: async function* () {
        yield Buffer.from('   ')
      },
    } as unknown as IncomingMessage

    const result = await readJsonBody(mockReq)
    expect(result).toEqual({})
  })

  it('handles multiple chunks', async () => {
    const mockReq = {
      [Symbol.asyncIterator]: async function* () {
        yield Buffer.from('{"key":')
        yield Buffer.from('"value"}')
      },
    } as unknown as IncomingMessage

    const result = await readJsonBody(mockReq)
    expect(result).toEqual({ key: 'value' })
  })

  it('handles string chunks', async () => {
    const mockReq = {
      [Symbol.asyncIterator]: async function* () {
        yield '{"key":"value"}'
      },
    } as unknown as IncomingMessage

    const result = await readJsonBody(mockReq)
    expect(result).toEqual({ key: 'value' })
  })
})

describe('json', () => {
  it('sets status code and content type', () => {
    const mockRes = {
      statusCode: 200,
      headers: {} as Record<string, string>,
      setHeader: function (name: string, value: string) {
        this.headers[name] = value
      },
      end: function (data: string) {
        this.data = data
      },
      data: '',
    } as unknown as ServerResponse

    json(mockRes, 201, { success: true })

    expect(mockRes.statusCode).toBe(201)
    expect(mockRes.headers['Content-Type']).toBe('application/json')
    expect(mockRes.data).toBe('{"success":true}')
  })

  it('serializes complex objects', () => {
    const mockRes = {
      statusCode: 200,
      headers: {} as Record<string, string>,
      setHeader: function (name: string, value: string) {
        this.headers[name] = value
      },
      end: function (data: string) {
        this.data = data
      },
      data: '',
    } as unknown as ServerResponse

    json(mockRes, 200, { nested: { key: 'value' }, array: [1, 2, 3] })

    expect(JSON.parse(mockRes.data)).toEqual({ nested: { key: 'value' }, array: [1, 2, 3] })
  })

  it('handles error responses', () => {
    const mockRes = {
      statusCode: 200,
      headers: {} as Record<string, string>,
      setHeader: function (name: string, value: string) {
        this.headers[name] = value
      },
      end: function (data: string) {
        this.data = data
      },
      data: '',
    } as unknown as ServerResponse

    json(mockRes, 400, { success: false, error: 'Bad request' })

    expect(mockRes.statusCode).toBe(400)
    expect(JSON.parse(mockRes.data)).toEqual({ success: false, error: 'Bad request' })
  })
})
