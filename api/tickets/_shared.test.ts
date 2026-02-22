import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  slugFromTitle,
  repoHintPrefix,
  isUniqueViolation,
  parseSupabaseCredentials,
  parseSupabaseCredentialsWithServiceRole,
} from './_shared.js'

const originalEnv = process.env

describe('slugFromTitle', () => {
  it('converts title to lowercase slug', () => {
    expect(slugFromTitle('Hello World')).toBe('hello-world')
  })

  it('replaces spaces with hyphens', () => {
    expect(slugFromTitle('My Test Title')).toBe('my-test-title')
  })

  it('strips non-alphanumeric characters except hyphens', () => {
    expect(slugFromTitle('Test@Title#123')).toBe('testtitle123')
  })

  it('removes multiple consecutive hyphens', () => {
    expect(slugFromTitle('Test---Title')).toBe('test-title')
  })

  it('removes leading and trailing hyphens', () => {
    expect(slugFromTitle('-Test-Title-')).toBe('test-title')
  })

  it('returns "ticket" for empty string', () => {
    expect(slugFromTitle('')).toBe('ticket')
  })

  it('returns "ticket" for string with only special characters', () => {
    expect(slugFromTitle('!!!@@@###')).toBe('ticket')
  })

  it('handles whitespace-only strings', () => {
    expect(slugFromTitle('   ')).toBe('ticket')
  })

  it('trims whitespace', () => {
    expect(slugFromTitle('  Test Title  ')).toBe('test-title')
  })
})

describe('repoHintPrefix', () => {
  it('extracts short token from repo name', () => {
    expect(repoHintPrefix('beardedphil/portfolio-2026-hal')).toBe('HAL')
  })

  it('handles simple repo names', () => {
    // "my" is a 2-character token, so it's returned
    expect(repoHintPrefix('user/my-project')).toBe('MY')
    // "project" is 7 characters, so it falls back to first 4 letters: "PROJ"
    expect(repoHintPrefix('user/project')).toBe('PROJ')
  })

  it('prefers last suitable token', () => {
    expect(repoHintPrefix('org/very-long-project-name')).toBe('NAME')
  })

  it('handles tokens of length 2-6', () => {
    expect(repoHintPrefix('org/test')).toBe('TEST')
    expect(repoHintPrefix('org/abc')).toBe('ABC')
    expect(repoHintPrefix('org/abcdef')).toBe('ABCDEF')
  })

  it('skips tokens without letters', () => {
    expect(repoHintPrefix('org/123-456')).toBe('PRJ')
  })

  it('falls back to first 4 letters when no suitable token', () => {
    // Single letter tokens are returned as-is (uppercase)
    expect(repoHintPrefix('org/a')).toBe('A')
    // No letters case returns PRJ
    expect(repoHintPrefix('123-456')).toBe('PRJ')
  })

  it('handles repo name without slash', () => {
    expect(repoHintPrefix('my-repo')).toBe('REPO')
  })

  it('returns "PRJ" when no letters found', () => {
    expect(repoHintPrefix('123-456')).toBe('PRJ')
  })

  it('handles empty string', () => {
    expect(repoHintPrefix('')).toBe('PRJ')
  })
})

describe('isUniqueViolation', () => {
  it('returns false for null', () => {
    expect(isUniqueViolation(null)).toBe(false)
  })

  it('returns false for error without code or message', () => {
    expect(isUniqueViolation({})).toBe(false)
  })

  it('returns true for PostgreSQL unique violation code', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true)
  })

  it('returns true for duplicate key message', () => {
    expect(isUniqueViolation({ message: 'duplicate key value violates unique constraint' })).toBe(true)
  })

  it('returns true for unique constraint message', () => {
    expect(isUniqueViolation({ message: 'unique constraint violation' })).toBe(true)
  })

  it('handles case-insensitive message matching', () => {
    expect(isUniqueViolation({ message: 'DUPLICATE KEY ERROR' })).toBe(true)
    expect(isUniqueViolation({ message: 'UNIQUE CONSTRAINT' })).toBe(true)
  })

  it('returns false for other error codes', () => {
    expect(isUniqueViolation({ code: '23503' })).toBe(false)
    expect(isUniqueViolation({ code: '42P01' })).toBe(false)
  })

  it('returns false for other error messages', () => {
    expect(isUniqueViolation({ message: 'syntax error' })).toBe(false)
    expect(isUniqueViolation({ message: 'permission denied' })).toBe(false)
  })
})

describe('parseSupabaseCredentials', () => {
  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.SUPABASE_URL
    delete process.env.VITE_SUPABASE_URL
    delete process.env.SUPABASE_ANON_KEY
    delete process.env.VITE_SUPABASE_ANON_KEY
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('uses body values when provided', () => {
    const result = parseSupabaseCredentials({
      supabaseUrl: 'https://test.supabase.co',
      supabaseAnonKey: 'test-key',
    })
    expect(result.supabaseUrl).toBe('https://test.supabase.co')
    expect(result.supabaseAnonKey).toBe('test-key')
  })

  it('trims whitespace from body values', () => {
    const result = parseSupabaseCredentials({
      supabaseUrl: '  https://test.supabase.co  ',
      supabaseAnonKey: '  test-key  ',
    })
    expect(result.supabaseUrl).toBe('https://test.supabase.co')
    expect(result.supabaseAnonKey).toBe('test-key')
  })

  it('falls back to SUPABASE_URL env var', () => {
    process.env.SUPABASE_URL = 'https://env.supabase.co'
    const result = parseSupabaseCredentials({})
    expect(result.supabaseUrl).toBe('https://env.supabase.co')
  })

  it('falls back to VITE_SUPABASE_URL env var', () => {
    process.env.VITE_SUPABASE_URL = 'https://vite.supabase.co'
    const result = parseSupabaseCredentials({})
    expect(result.supabaseUrl).toBe('https://vite.supabase.co')
  })

  it('prefers body over env vars', () => {
    process.env.SUPABASE_URL = 'https://env.supabase.co'
    const result = parseSupabaseCredentials({
      supabaseUrl: 'https://body.supabase.co',
    })
    expect(result.supabaseUrl).toBe('https://body.supabase.co')
  })

  it('handles empty body values', () => {
    const result = parseSupabaseCredentials({})
    expect(result.supabaseUrl).toBeUndefined()
    expect(result.supabaseAnonKey).toBeUndefined()
  })
})

describe('parseSupabaseCredentialsWithServiceRole', () => {
  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.SUPABASE_URL
    delete process.env.VITE_SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    delete process.env.SUPABASE_SECRET_KEY
    delete process.env.SUPABASE_ANON_KEY
    delete process.env.VITE_SUPABASE_ANON_KEY
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('prefers service role key from env', () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
    const result = parseSupabaseCredentialsWithServiceRole({})
    expect(result.supabaseKey).toBe('service-key')
  })

  it('falls back to secret key', () => {
    process.env.SUPABASE_SECRET_KEY = 'secret-key'
    const result = parseSupabaseCredentialsWithServiceRole({})
    expect(result.supabaseKey).toBe('secret-key')
  })

  it('falls back to body anon key', () => {
    const result = parseSupabaseCredentialsWithServiceRole({
      supabaseAnonKey: 'body-key',
    })
    expect(result.supabaseKey).toBe('body-key')
  })

  it('prefers service role over body key', () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
    const result = parseSupabaseCredentialsWithServiceRole({
      supabaseAnonKey: 'body-key',
    })
    expect(result.supabaseKey).toBe('service-key')
  })

  it('trims whitespace', () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = '  service-key  '
    const result = parseSupabaseCredentialsWithServiceRole({})
    expect(result.supabaseKey).toBe('service-key')
  })
})
