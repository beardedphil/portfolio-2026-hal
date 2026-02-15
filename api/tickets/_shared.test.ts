/**
 * Unit tests for shared ticket/kanban endpoint utilities.
 * Tests the shared logic extracted from create.ts and move.ts.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  slugFromTitle,
  repoHintPrefix,
  isUniqueViolation,
  parseSupabaseCredentials,
  generateTicketBody,
} from './_shared.js'

describe('slugFromTitle', () => {
  it('converts title to lowercase slug', () => {
    expect(slugFromTitle('My Ticket Title')).toBe('my-ticket-title')
    expect(slugFromTitle('UPPERCASE TITLE')).toBe('uppercase-title')
  })

  it('replaces spaces with hyphens', () => {
    expect(slugFromTitle('Ticket With Spaces')).toBe('ticket-with-spaces')
    expect(slugFromTitle('Multiple   Spaces')).toBe('multiple-spaces')
  })

  it('strips non-alphanumeric characters except hyphens', () => {
    expect(slugFromTitle('Ticket #123!')).toBe('ticket-123')
    expect(slugFromTitle('Ticket@#$%Title')).toBe('tickettitle')
    expect(slugFromTitle('Ticket (with) [brackets]')).toBe('ticket-with-brackets')
  })

  it('collapses multiple hyphens', () => {
    expect(slugFromTitle('Ticket---With---Hyphens')).toBe('ticket-with-hyphens')
    expect(slugFromTitle('Ticket   With   Spaces')).toBe('ticket-with-spaces')
  })

  it('removes leading and trailing hyphens', () => {
    expect(slugFromTitle('-Ticket-')).toBe('ticket')
    expect(slugFromTitle('---Ticket---')).toBe('ticket')
  })

  it('handles empty or whitespace-only strings', () => {
    expect(slugFromTitle('')).toBe('ticket')
    expect(slugFromTitle('   ')).toBe('ticket')
    expect(slugFromTitle('---')).toBe('ticket')
  })

  it('preserves alphanumeric characters and hyphens', () => {
    expect(slugFromTitle('Ticket-123-ABC')).toBe('ticket-123-abc')
    expect(slugFromTitle('ticket-123')).toBe('ticket-123')
  })

  it('handles special characters in title', () => {
    expect(slugFromTitle('Ticket: "Important" Update')).toBe('ticket-important-update')
    expect(slugFromTitle('Ticket & Update')).toBe('ticket-update')
  })
})

describe('repoHintPrefix', () => {
  it('extracts prefix from repo full name', () => {
    expect(repoHintPrefix('beardedphil/portfolio-2026-hal')).toBe('HAL')
    expect(repoHintPrefix('user/my-project')).toBe('PROJ')
  })

  it('handles repo names with hyphens', () => {
    expect(repoHintPrefix('org/repo-name')).toBe('NAME')
    expect(repoHintPrefix('org/my-repo')).toBe('REPO')
  })

  it('handles repo names with underscores', () => {
    expect(repoHintPrefix('org/repo_name')).toBe('NAME')
  })

  it('handles short token names (2-6 chars)', () => {
    expect(repoHintPrefix('org/abc')).toBe('ABC')
    expect(repoHintPrefix('org/abcdef')).toBe('ABCDEF')
    expect(repoHintPrefix('org/a')).toBe('PRJ') // too short, falls back
  })

  it('handles repo names with only numbers', () => {
    expect(repoHintPrefix('org/12345')).toBe('PRJ') // no letters, falls back
  })

  it('handles repo names without separators', () => {
    expect(repoHintPrefix('myrepo')).toBe('MYRE')
    expect(repoHintPrefix('abc')).toBe('ABC')
  })

  it('handles empty or invalid repo names', () => {
    expect(repoHintPrefix('')).toBe('PRJ')
    expect(repoHintPrefix('/')).toBe('PRJ')
  })

  it('prefers tokens from the end of the repo name', () => {
    expect(repoHintPrefix('org/very-long-repo-name')).toBe('NAME')
    expect(repoHintPrefix('org/project-abc')).toBe('ABC')
  })

  it('extracts first 4 letters if no suitable token found', () => {
    expect(repoHintPrefix('org/verylongreponame')).toBe('VERY')
    expect(repoHintPrefix('myproject')).toBe('MYPR')
  })
})

describe('isUniqueViolation', () => {
  it('detects PostgreSQL unique violation by code', () => {
    expect(isUniqueViolation({ code: '23505', message: 'duplicate key' })).toBe(true)
    expect(isUniqueViolation({ code: '23505' })).toBe(true)
  })

  it('detects unique violation by message content', () => {
    expect(isUniqueViolation({ message: 'duplicate key value violates unique constraint' })).toBe(true)
    expect(isUniqueViolation({ message: 'UNIQUE constraint violation' })).toBe(true)
    expect(isUniqueViolation({ message: 'Duplicate key' })).toBe(true)
  })

  it('handles case-insensitive message matching', () => {
    expect(isUniqueViolation({ message: 'DUPLICATE KEY' })).toBe(true)
    expect(isUniqueViolation({ message: 'Unique Constraint' })).toBe(true)
  })

  it('returns false for non-unique violations', () => {
    expect(isUniqueViolation({ code: '23503', message: 'foreign key violation' })).toBe(false)
    expect(isUniqueViolation({ code: '42P01', message: 'relation does not exist' })).toBe(false)
    expect(isUniqueViolation({ message: 'some other error' })).toBe(false)
  })

  it('returns false for null or undefined errors', () => {
    expect(isUniqueViolation(null)).toBe(false)
    expect(isUniqueViolation(undefined as any)).toBe(false)
  })

  it('handles errors without code or message', () => {
    expect(isUniqueViolation({})).toBe(false)
    expect(isUniqueViolation({ code: undefined, message: undefined })).toBe(false)
  })
})

describe('parseSupabaseCredentials', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
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

describe('generateTicketBody', () => {
  it('generates body for single suggestion', () => {
    const sourceRef = 'HAL-0121'
    const suggestion = 'Add unit tests for shared utilities'
    const idempotencySection = '- **Suggestion Hash**: abc123'
    
    const result = generateTicketBody(sourceRef, true, suggestion, idempotencySection)
    
    expect(result.title).toBe('Add unit tests for shared utilities')
    expect(result.bodyMd).toContain('## Goal (one sentence)')
    expect(result.bodyMd).toContain(suggestion)
    expect(result.bodyMd).toContain(`- **Proposed from**: ${sourceRef} — Process Review`)
    expect(result.bodyMd).toContain(idempotencySection)
    expect(result.bodyMd).not.toContain('## Suggested improvements')
  })

  it('truncates long single suggestion titles', () => {
    const longSuggestion = 'A'.repeat(150)
    const result = generateTicketBody('HAL-0121', true, longSuggestion, '')
    
    expect(result.title).toBe('A'.repeat(97) + '...')
    expect(result.title.length).toBe(100)
  })

  it('generates body for multiple suggestions', () => {
    const sourceRef = 'HAL-0121'
    const suggestions = '- Suggestion 1\n- Suggestion 2\n- Suggestion 3'
    const idempotencySection = ''
    
    const result = generateTicketBody(sourceRef, false, suggestions, idempotencySection)
    
    expect(result.title).toBe(`Improve agent instructions based on ${sourceRef} Process Review`)
    expect(result.bodyMd).toContain('## Goal (one sentence)')
    expect(result.bodyMd).toContain('Improve agent instructions and process documentation')
    expect(result.bodyMd).toContain('## Suggested improvements')
    expect(result.bodyMd).toContain(suggestions)
  })

  it('includes idempotency section when provided', () => {
    const result = generateTicketBody('HAL-0121', true, 'Test', '- **Suggestion Hash**: abc123')
    expect(result.bodyMd).toContain('- **Suggestion Hash**: abc123')
  })

  it('omits idempotency section when empty', () => {
    const result = generateTicketBody('HAL-0121', true, 'Test', '')
    expect(result.bodyMd).not.toContain('Suggestion Hash')
  })

  it('includes all required sections for single suggestion', () => {
    const result = generateTicketBody('HAL-0121', true, 'Test suggestion', '')
    expect(result.bodyMd).toContain('# Ticket')
    expect(result.bodyMd).toContain('## Goal (one sentence)')
    expect(result.bodyMd).toContain('## Human-verifiable deliverable (UI-only)')
    expect(result.bodyMd).toContain('## Acceptance criteria (UI-only)')
    expect(result.bodyMd).toContain('## Constraints')
    expect(result.bodyMd).toContain('## Non-goals')
    expect(result.bodyMd).toContain('## Implementation notes (optional)')
  })

  it('includes all required sections for multiple suggestions', () => {
    const result = generateTicketBody('HAL-0121', false, '- Suggestion 1', '')
    expect(result.bodyMd).toContain('# Ticket')
    expect(result.bodyMd).toContain('## Goal (one sentence)')
    expect(result.bodyMd).toContain('## Suggested improvements')
    expect(result.bodyMd).toContain('## Implementation notes (optional)')
  })
})
