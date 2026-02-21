import { describe, it, expect } from 'vitest'
import {
  validateNoPlaceholders,
  isAbortError,
  hasGitHubRepo,
  truncateForLogging,
  createRedArtifactBody,
  createRedArtifactTitle,
} from './projectManager/helpers.js'

/**
 * Unit tests for projectManager.ts behaviors.
 * 
 * These tests focus on testable behaviors that can be extracted and tested
 * without requiring full integration with OpenAI API or HAL server.
 */

describe('projectManager placeholder detection', () => {
  it('detects placeholders in ticket body', () => {
    const bodyWithPlaceholder = 'This is a ticket with <AC 1> placeholder'
    const result = validateNoPlaceholders(bodyWithPlaceholder)
    expect(result.hasPlaceholders).toBe(true)
    expect(result.uniquePlaceholders).toContain('<AC 1>')
    expect(result.uniquePlaceholders.length).toBe(1)
    expect(result.errorMessage).toBeDefined()
  })

  it('detects multiple placeholders', () => {
    const body = 'Ticket with <AC 1> and <task-id> and <placeholder>'
    const result = validateNoPlaceholders(body)
    expect(result.hasPlaceholders).toBe(true)
    expect(result.uniquePlaceholders.length).toBe(3)
    expect(result.uniquePlaceholders).toContain('<AC 1>')
    expect(result.uniquePlaceholders).toContain('<task-id>')
    expect(result.uniquePlaceholders).toContain('<placeholder>')
  })

  it('returns no placeholders when none found', () => {
    const body = 'This is a ticket without any placeholders'
    const result = validateNoPlaceholders(body)
    expect(result.hasPlaceholders).toBe(false)
    expect(result.uniquePlaceholders).toEqual([])
    expect(result.errorMessage).toBeUndefined()
  })

  it('handles unique placeholder deduplication', () => {
    const body = 'Ticket with <AC 1> and <AC 1> and <task-id> and <AC 1>'
    const result = validateNoPlaceholders(body)
    expect(result.uniquePlaceholders).toEqual(['<AC 1>', '<task-id>'])
    expect(result.uniquePlaceholders.length).toBe(2)
  })
})

describe('projectManager abort error detection', () => {

  it('detects abort when signal is aborted', () => {
    const err = new Error('Some error')
    const abortSignal = { aborted: true }
    expect(isAbortError(err, abortSignal)).toBe(true)
  })

  it('detects abort when error name is AbortError', () => {
    const err = { name: 'AbortError' } as Error
    expect(isAbortError(err)).toBe(true)
  })

  it('detects abort when error message contains "aborted"', () => {
    const err = new Error('Request was aborted')
    expect(isAbortError(err)).toBe(true)
  })

  it('detects abort when error message contains "abort" (case insensitive)', () => {
    const err = new Error('ABORT signal received')
    expect(isAbortError(err)).toBe(true)
  })

  it('returns false for non-abort errors', () => {
    const err = new Error('Network timeout')
    const abortSignal = { aborted: false }
    expect(isAbortError(err, abortSignal)).toBe(false)
  })

  it('returns false when signal is not aborted and error is not abort-related', () => {
    const err = new Error('Some other error')
    expect(isAbortError(err)).toBe(false)
  })
})

describe('projectManager tool input truncation', () => {
  it('truncates long body_md input for logging (500 char limit)', () => {
    const longBody = 'A'.repeat(1000)
    const truncated = truncateForLogging(longBody)
    expect(truncated.length).toBe(503) // 500 chars + '...'
    expect(truncated.endsWith('...')).toBe(true)
  })

  it('does not truncate short body_md input', () => {
    const shortBody = 'Short ticket body'
    const truncated = truncateForLogging(shortBody)
    expect(truncated).toBe(shortBody)
    expect(truncated).not.toContain('...')
  })

  it('handles exactly 500 characters correctly', () => {
    const exactBody = 'A'.repeat(500)
    const truncated = truncateForLogging(exactBody)
    expect(truncated).toBe(exactBody)
    expect(truncated.length).toBe(500)
  })

  it('allows custom max length', () => {
    const body = 'A'.repeat(200)
    const truncated = truncateForLogging(body, 100)
    expect(truncated.length).toBe(103) // 100 chars + '...'
    expect(truncated.endsWith('...')).toBe(true)
  })
})

describe('projectManager GitHub repo detection', () => {

  it('returns true when repoFullName is string and githubReadFile is function', () => {
    const repoFullName = 'owner/repo'
    const githubReadFile = async () => ({ content: 'test' })
    expect(hasGitHubRepo(repoFullName, githubReadFile)).toBe(true)
  })

  it('returns false when repoFullName is empty string', () => {
    const repoFullName = ''
    const githubReadFile = async () => ({ content: 'test' })
    expect(hasGitHubRepo(repoFullName, githubReadFile)).toBe(false)
  })

  it('returns false when repoFullName is whitespace only', () => {
    const repoFullName = '   '
    const githubReadFile = async () => ({ content: 'test' })
    expect(hasGitHubRepo(repoFullName, githubReadFile)).toBe(false)
  })

  it('returns false when githubReadFile is not a function', () => {
    const repoFullName = 'owner/repo'
    const githubReadFile = undefined
    expect(hasGitHubRepo(repoFullName, githubReadFile)).toBe(false)
  })

  it('returns false when repoFullName is undefined', () => {
    const githubReadFile = async () => ({ content: 'test' })
    expect(hasGitHubRepo(undefined, githubReadFile)).toBe(false)
  })
})

describe('projectManager RED artifact helpers', () => {
  it('creates RED artifact title with version and date', () => {
    const createdAt = '2026-02-21T12:00:00.000Z'
    const title = createRedArtifactTitle(1, createdAt)
    expect(title).toBe('RED v1 — 2026-02-21')
  })

  it('creates RED artifact body with all required fields', () => {
    const body = createRedArtifactBody(1, 'red-123', '2026-02-21T12:00:00.000Z', 'valid', { test: 'data' })
    expect(body).toContain('# RED Document Version 1')
    expect(body).toContain('RED ID: red-123')
    expect(body).toContain('Created: 2026-02-21T12:00:00.000Z')
    expect(body).toContain('Validation Status: valid')
    expect(body).toContain('```json')
    expect(body).toContain('"test": "data"')
  })

  it('handles version 0 correctly', () => {
    const title = createRedArtifactTitle(0, '2026-02-21T12:00:00.000Z')
    expect(title).toBe('RED v0 — 2026-02-21')
  })
})
