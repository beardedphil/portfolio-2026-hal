import { describe, it, expect } from 'vitest'
import {
  validateTicketPlaceholders,
  createPlaceholderError,
  parseHalResponse,
  getRepoFullName,
} from './ticketValidation.js'

describe('ticketValidation', () => {
  describe('validateTicketPlaceholders', () => {
    it('returns valid=true when no placeholders are present', () => {
      const body = 'This is a valid ticket body without any placeholders.'
      const result = validateTicketPlaceholders(body)
      expect(result.valid).toBe(true)
      expect(result.placeholders).toEqual([])
    })

    it('detects single placeholder', () => {
      const body = 'Ticket body with <AC 1> placeholder'
      const result = validateTicketPlaceholders(body)
      expect(result.valid).toBe(false)
      expect(result.placeholders).toContain('<AC 1>')
    })

    it('detects multiple placeholders', () => {
      const body = 'Body with <AC 1> and <AC 2> and <task-id>'
      const result = validateTicketPlaceholders(body)
      expect(result.valid).toBe(false)
      expect(result.placeholders.length).toBeGreaterThan(0)
    })

    it('deduplicates identical placeholders', () => {
      const body = 'Body with <AC 1> repeated <AC 1> multiple <AC 1> times'
      const result = validateTicketPlaceholders(body)
      expect(result.valid).toBe(false)
      expect(result.placeholders).toEqual(['<AC 1>'])
    })

    it('handles empty string', () => {
      const result = validateTicketPlaceholders('')
      expect(result.valid).toBe(true)
      expect(result.placeholders).toEqual([])
    })

    it('handles whitespace-only string', () => {
      const result = validateTicketPlaceholders('   \n\n   ')
      expect(result.valid).toBe(true)
      expect(result.placeholders).toEqual([])
    })

    it('trims input before validation', () => {
      const body = '   Body with <AC 1>   '
      const result = validateTicketPlaceholders(body)
      expect(result.valid).toBe(false)
      expect(result.placeholders).toContain('<AC 1>')
    })
  })

  describe('createPlaceholderError', () => {
    it('creates error response with single placeholder', () => {
      const placeholders = ['<AC 1>']
      const error = createPlaceholderError(placeholders)
      
      expect(error.success).toBe(false)
      expect(error.error).toContain('unresolved template placeholder tokens detected')
      expect(error.error).toContain('<AC 1>')
      expect(error.detectedPlaceholders).toEqual(['<AC 1>'])
    })

    it('creates error response with multiple placeholders', () => {
      const placeholders = ['<AC 1>', '<AC 2>', '<task-id>']
      const error = createPlaceholderError(placeholders)
      
      expect(error.success).toBe(false)
      expect(error.detectedPlaceholders).toEqual(['<AC 1>', '<AC 2>', '<task-id>'])
      expect(error.error).toContain('<AC 1>')
      expect(error.error).toContain('<AC 2>')
      expect(error.error).toContain('<task-id>')
    })

    it('handles empty placeholder array', () => {
      const error = createPlaceholderError([])
      
      expect(error.success).toBe(false)
      expect(error.detectedPlaceholders).toEqual([])
      expect(error.error).toContain('unresolved template placeholder tokens detected')
    })
  })

  describe('parseHalResponse', () => {
    it('parses valid JSON response', () => {
      const json = { success: true, data: { id: '123' } }
      const text = JSON.stringify(json)
      const result = parseHalResponse(text, '/api/test', 200, 'application/json')
      
      expect(result).toEqual(json)
    })

    it('returns empty object for empty text', () => {
      const result = parseHalResponse('', '/api/test', 200, 'application/json')
      expect(result).toEqual({})
    })

    it('handles non-JSON response gracefully', () => {
      const text = 'Internal Server Error'
      const result = parseHalResponse(text, '/api/test', 500, 'text/plain')
      
      expect(result.success).toBe(false)
      expect(result.error).toContain('Non-JSON response')
      expect(result.error).toContain('/api/test')
      expect(result.error).toContain('HTTP 500')
      expect(result.error).toContain('text/plain')
    })

    it('includes response prefix in error message', () => {
      const longText = 'Error message that is longer than 200 characters. '.repeat(10)
      const result = parseHalResponse(longText, '/api/test', 500, 'text/plain')
      
      expect(result.error).toContain('Error message that is longer')
      expect(result.error.length).toBeLessThan(longText.length + 100) // Should be truncated
    })

    it('handles missing content-type header', () => {
      const text = 'Error response'
      const result = parseHalResponse(text, '/api/test', 500, null)
      
      expect(result.success).toBe(false)
      expect(result.error).toContain('content-type: unknown')
    })

    it('handles malformed JSON', () => {
      const text = '{ invalid json }'
      const result = parseHalResponse(text, '/api/test', 200, 'application/json')
      
      expect(result.success).toBe(false)
      expect(result.error).toContain('Non-JSON response')
    })
  })

  describe('getRepoFullName', () => {
    it('returns projectId when it is a valid string', () => {
      const result = getRepoFullName('owner/repo', 'default/repo')
      expect(result).toBe('owner/repo')
    })

    it('trims whitespace from projectId', () => {
      const result = getRepoFullName('  owner/repo  ', 'default/repo')
      expect(result).toBe('owner/repo')
    })

    it('returns default when projectId is empty string', () => {
      const result = getRepoFullName('', 'default/repo')
      expect(result).toBe('default/repo')
    })

    it('returns default when projectId is whitespace-only', () => {
      const result = getRepoFullName('   ', 'default/repo')
      expect(result).toBe('default/repo')
    })

    it('returns default when projectId is null', () => {
      const result = getRepoFullName(null, 'default/repo')
      expect(result).toBe('default/repo')
    })

    it('returns default when projectId is undefined', () => {
      const result = getRepoFullName(undefined, 'default/repo')
      expect(result).toBe('default/repo')
    })

    it('returns default when projectId is not a string', () => {
      const result = getRepoFullName(123, 'default/repo')
      expect(result).toBe('default/repo')
    })
  })
})
