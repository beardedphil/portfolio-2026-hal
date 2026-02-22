import { describe, it, expect } from 'vitest'
import {
  validateNoPlaceholders,
  normalizeTicketId,
  getRepoFullName,
  parseJsonResponse,
} from './toolHelpers.js'

describe('validateNoPlaceholders', () => {
  it('returns empty array when no placeholders are found', () => {
    const body = '## Goal\n\nThis is a complete ticket body without placeholders.'
    const result = validateNoPlaceholders(body)
    expect(result).toEqual([])
  })

  it('detects single placeholder', () => {
    const body = '## Goal\n\n<AC 1> placeholder content'
    const result = validateNoPlaceholders(body)
    expect(result).toContain('<AC 1>')
    expect(result.length).toBe(1)
  })

  it('detects multiple unique placeholders', () => {
    const body = '<AC 1> <AC 2> <task-id> content'
    const result = validateNoPlaceholders(body)
    expect(result.length).toBeGreaterThan(1)
    expect(result).toContain('<AC 1>')
    expect(result).toContain('<AC 2>')
    expect(result).toContain('<task-id>')
  })

  it('deduplicates identical placeholders', () => {
    const body = '<AC 1> <AC 1> <AC 1> content'
    const result = validateNoPlaceholders(body)
    expect(result).toEqual(['<AC 1>'])
  })

  it('handles empty string', () => {
    const result = validateNoPlaceholders('')
    expect(result).toEqual([])
  })

  it('handles whitespace-only string', () => {
    const result = validateNoPlaceholders('   \n\n   ')
    expect(result).toEqual([])
  })
})

describe('normalizeTicketId', () => {
  it('normalizes HAL-prefixed ticket ID', () => {
    expect(normalizeTicketId('HAL-0012')).toBe('0012')
  })

  it('normalizes 4-digit ticket ID', () => {
    expect(normalizeTicketId('0012')).toBe('0012')
  })

  it('normalizes short ticket ID with padding', () => {
    expect(normalizeTicketId('12')).toBe('0012')
    expect(normalizeTicketId('1')).toBe('0001')
  })

  it('handles null ticket number by defaulting to 0000', () => {
    expect(normalizeTicketId('invalid')).toBe('0000')
  })

  it('normalizes various formats correctly', () => {
    expect(normalizeTicketId('HAL-123')).toBe('0123')
    expect(normalizeTicketId('123')).toBe('0123')
    expect(normalizeTicketId('0000')).toBe('0000')
  })
})

describe('getRepoFullName', () => {
  it('returns projectId when provided and non-empty', () => {
    expect(getRepoFullName('owner/my-repo')).toBe('owner/my-repo')
    expect(getRepoFullName('  owner/my-repo  ')).toBe('owner/my-repo')
  })

  it('returns default when projectId is undefined', () => {
    expect(getRepoFullName(undefined)).toBe('beardedphil/portfolio-2026-hal')
  })

  it('returns default when projectId is empty string', () => {
    expect(getRepoFullName('')).toBe('beardedphil/portfolio-2026-hal')
  })

  it('returns default when projectId is whitespace-only', () => {
    expect(getRepoFullName('   ')).toBe('beardedphil/portfolio-2026-hal')
  })
})

describe('parseJsonResponse', () => {
  it('parses valid JSON response', () => {
    const jsonText = '{"success": true, "data": "test"}'
    const result = parseJsonResponse(jsonText, '/api/test', 200, 'application/json')
    expect(result.success).toBe(true)
    expect(result.json.success).toBe(true)
    expect(result.json.data).toBe('test')
  })

  it('returns empty object for empty text', () => {
    const result = parseJsonResponse('', '/api/test', 200, 'application/json')
    expect(result.success).toBe(true)
    expect(result.json).toEqual({})
  })

  it('handles invalid JSON gracefully', () => {
    const invalidJson = 'not valid json'
    const result = parseJsonResponse(invalidJson, '/api/test', 200, 'application/json')
    expect(result.success).toBe(false)
    expect(result.json.success).toBe(false)
    expect(result.json.error).toContain('Non-JSON response')
    expect(result.json.error).toContain('/api/test')
  })

  it('includes HTTP status in error message', () => {
    const invalidJson = 'error response'
    const result = parseJsonResponse(invalidJson, '/api/test', 500, 'text/plain')
    expect(result.json.error).toContain('HTTP 500')
  })

  it('includes content-type in error message', () => {
    const invalidJson = 'error response'
    const result = parseJsonResponse(invalidJson, '/api/test', 200, 'text/html')
    expect(result.json.error).toContain('text/html')
  })

  it('truncates long error responses', () => {
    const longInvalidJson = 'x'.repeat(500)
    const result = parseJsonResponse(longInvalidJson, '/api/test', 200, 'text/plain')
    expect(result.json.error.length).toBeLessThan(300) // Should be truncated
  })
})
