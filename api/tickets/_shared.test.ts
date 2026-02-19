/**
 * Unit tests for shared ticket/kanban endpoint utilities.
 * Tests the shared logic extracted from create.ts and move.ts.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  readJsonBody,
  json,
  slugFromTitle,
  repoHintPrefix,
  isUniqueViolation,
  parseSupabaseCredentials,
} from './_shared.js'
import type { IncomingMessage, ServerResponse } from 'http'

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

  it('handles special characters and unicode', () => {
    expect(slugFromTitle('Café & Restaurant')).toBe('caf-restaurant')
    expect(slugFromTitle('日本語')).toBe('ticket') // No alphanumeric, returns 'ticket'
    expect(slugFromTitle('Test123')).toBe('test123')
  })
})

describe('repoHintPrefix', () => {
  it('extracts prefix from simple repo name', () => {
    expect(repoHintPrefix('owner/repo')).toBe('REPO')
    expect(repoHintPrefix('user/my-project')).toBe('MY') // Returns first 2-6 char token from end
  })

  it('finds 2-6 character token from end', () => {
    expect(repoHintPrefix('owner/portfolio-2026-hal')).toBe('HAL')
    expect(repoHintPrefix('user/test-repo')).toBe('REPO')
    expect(repoHintPrefix('org/my-awesome-project')).toBe('MY') // Returns first 2-6 char token from end
  })

  it('returns first 2-6 char token from end (not necessarily longest)', () => {
    expect(repoHintPrefix('owner/a-b-c-project')).toBe('ABCP') // Falls back to first 4 letters
    expect(repoHintPrefix('user/x-y-z-app')).toBe('APP')
  })

  it('skips tokens without letters', () => {
    expect(repoHintPrefix('owner/123-456')).toBe('PRJ')
    expect(repoHintPrefix('user/2024-project')).toBe('PROJ') // Falls back to first 4 letters
  })

  it('falls back to first 4 letters if no suitable token', () => {
    expect(repoHintPrefix('owner/123')).toBe('PRJ')
    expect(repoHintPrefix('user/a')).toBe('A') // Single letter, falls back to first 4 letters (only 1 available)
    expect(repoHintPrefix('org/xyz')).toBe('XYZ')
  })

  it('handles repo name without slash', () => {
    expect(repoHintPrefix('portfolio-2026-hal')).toBe('HAL')
    expect(repoHintPrefix('my-project')).toBe('MY') // Returns first 2-6 char token from end
  })

  it('handles edge cases', () => {
    expect(repoHintPrefix('')).toBe('PRJ')
    expect(repoHintPrefix('/')).toBe('PRJ')
    expect(repoHintPrefix('a/b')).toBe('B') // 'b' is 1 char, falls back to first 4 letters (only 1 available)
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

  it('handles missing message property', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true)
    expect(isUniqueViolation({})).toBe(false)
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

describe('parseSupabaseCredentials', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    // Ensure tests are deterministic even if developer env sets Supabase variables.
    delete (process.env as any).SUPABASE_URL
    delete (process.env as any).SUPABASE_ANON_KEY
    delete (process.env as any).SUPABASE_SECRET_KEY
    delete (process.env as any).SUPABASE_SERVICE_ROLE_KEY
    delete (process.env as any).VITE_SUPABASE_URL
    delete (process.env as any).VITE_SUPABASE_ANON_KEY
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('extracts credentials from request body', () => {
    const body = {
      supabaseUrl: 'https://example.supabase.co',
      supabaseAnonKey: 'test-anon-key',
    }
    const result = parseSupabaseCredentials(body)
    expect(result.supabaseUrl).toBe('https://example.supabase.co')
    expect(result.supabaseAnonKey).toBe('test-anon-key')
  })

  it('trims whitespace from credentials', () => {
    const body = {
      supabaseUrl: '  https://example.supabase.co  ',
      supabaseAnonKey: '  test-anon-key  ',
    }
    const result = parseSupabaseCredentials(body)
    expect(result.supabaseUrl).toBe('https://example.supabase.co')
    expect(result.supabaseAnonKey).toBe('test-anon-key')
  })

  it('falls back to SUPABASE_URL environment variable', () => {
    process.env.SUPABASE_URL = 'https://env.supabase.co'
    process.env.SUPABASE_ANON_KEY = 'env-anon-key'
    const body = {}
    const result = parseSupabaseCredentials(body)
    expect(result.supabaseUrl).toBe('https://env.supabase.co')
    expect(result.supabaseAnonKey).toBe('env-anon-key')
  })

  it('falls back to VITE_SUPABASE_URL environment variable', () => {
    process.env.VITE_SUPABASE_URL = 'https://vite.supabase.co'
    process.env.VITE_SUPABASE_ANON_KEY = 'vite-anon-key'
    const body = {}
    const result = parseSupabaseCredentials(body)
    expect(result.supabaseUrl).toBe('https://vite.supabase.co')
    expect(result.supabaseAnonKey).toBe('vite-anon-key')
  })

  it('prefers request body over environment variables', () => {
    process.env.SUPABASE_URL = 'https://env.supabase.co'
    process.env.SUPABASE_ANON_KEY = 'env-anon-key'
    const body = {
      supabaseUrl: 'https://body.supabase.co',
      supabaseAnonKey: 'body-anon-key',
    }
    const result = parseSupabaseCredentials(body)
    expect(result.supabaseUrl).toBe('https://body.supabase.co')
    expect(result.supabaseAnonKey).toBe('body-anon-key')
  })

  it('returns undefined when no credentials are provided', () => {
    const body = {}
    const result = parseSupabaseCredentials(body)
    expect(result.supabaseUrl).toBeUndefined()
    expect(result.supabaseAnonKey).toBeUndefined()
  })

  it('handles non-string values in body', () => {
    const body = {
      supabaseUrl: 123,
      supabaseAnonKey: null,
    }
    const result = parseSupabaseCredentials(body)
    expect(result.supabaseUrl).toBeUndefined()
    expect(result.supabaseAnonKey).toBeUndefined()
  })
})
