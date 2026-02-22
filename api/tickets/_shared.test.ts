import { describe, it, expect } from 'vitest'
import { slugFromTitle, repoHintPrefix, isUniqueViolation } from './_shared.js'

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
