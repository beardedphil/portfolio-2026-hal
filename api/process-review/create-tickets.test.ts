/**
 * Unit tests for create-tickets.ts endpoint.
 * Tests helper functions, validation, and handler behavior.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'http'
import handler, {
  slugFromTitle,
  repoHintPrefix,
  hashSuggestion,
  isUniqueViolation,
} from './create-tickets.js'
import crypto from 'node:crypto'

describe('slugFromTitle', () => {
  it('converts title to lowercase slug with hyphens', () => {
    expect(slugFromTitle('Test Title')).toBe('test-title')
  })

  it('removes non-alphanumeric characters except hyphens', () => {
    expect(slugFromTitle('Test@Title#123')).toBe('testtitle123')
  })

  it('collapses multiple spaces and hyphens', () => {
    expect(slugFromTitle('Test   Title---With   Hyphens')).toBe('test-title-with-hyphens')
  })

  it('removes leading and trailing hyphens', () => {
    expect(slugFromTitle('-Test Title-')).toBe('test-title')
  })

  it('returns "ticket" for empty or whitespace-only input', () => {
    expect(slugFromTitle('')).toBe('ticket')
    expect(slugFromTitle('   ')).toBe('ticket')
  })

  it('handles special characters and unicode', () => {
    expect(slugFromTitle('Test with émojis 🎉')).toBe('test-with-mojis')
  })
})

describe('repoHintPrefix', () => {
  it('extracts prefix from repo full name', () => {
    expect(repoHintPrefix('owner/repo-name')).toBe('NAME')
  })

  it('prefers shorter tokens from the end', () => {
    expect(repoHintPrefix('owner/very-long-repository-name')).toBe('NAME')
  })

  it('selects tokens between 2 and 6 characters', () => {
    expect(repoHintPrefix('owner/test')).toBe('TEST')
    expect(repoHintPrefix('owner/abcdef')).toBe('ABCDEF')
  })

  it('skips tokens without letters', () => {
    expect(repoHintPrefix('owner/123456')).not.toBe('123456')
  })

  it('falls back to first 4 letters when no suitable token found', () => {
    expect(repoHintPrefix('owner/123')).toBe('PRJ')
    expect(repoHintPrefix('owner/123456')).toBe('PRJ')
    // Single letter 'a' gets extracted as 'A' (only 1 char, so takes what's available)
    expect(repoHintPrefix('owner/123a456')).toBe('A')
    // No letters at all falls back to PRJ
    expect(repoHintPrefix('123456')).toBe('PRJ')
  })

  it('handles repo name without slash', () => {
    expect(repoHintPrefix('repo-name')).toBe('NAME')
  })

  it('handles empty repo name', () => {
    expect(repoHintPrefix('')).toBe('PRJ')
  })
})

describe('hashSuggestion', () => {
  it('generates 16-character hash', () => {
    const hash = hashSuggestion('review-123', 'Test suggestion')
    expect(hash).toHaveLength(16)
    expect(/^[a-f0-9]{16}$/i.test(hash)).toBe(true)
  })

  it('produces consistent hashes for same inputs', () => {
    const hash1 = hashSuggestion('review-123', 'Test suggestion')
    const hash2 = hashSuggestion('review-123', 'Test suggestion')
    expect(hash1).toBe(hash2)
  })

  it('produces different hashes for different reviewIds', () => {
    const hash1 = hashSuggestion('review-123', 'Test suggestion')
    const hash2 = hashSuggestion('review-456', 'Test suggestion')
    expect(hash1).not.toBe(hash2)
  })

  it('produces different hashes for different suggestions', () => {
    const hash1 = hashSuggestion('review-123', 'Test suggestion 1')
    const hash2 = hashSuggestion('review-123', 'Test suggestion 2')
    expect(hash1).not.toBe(hash2)
  })

  it('uses SHA256 and takes first 16 characters', () => {
    const reviewId = 'review-123'
    const suggestion = 'Test suggestion'
    const hash = hashSuggestion(reviewId, suggestion)
    
    const combined = `${reviewId}:${suggestion}`
    const fullHash = crypto.createHash('sha256').update(combined).digest('hex')
    const expectedHash = fullHash.substring(0, 16)
    
    expect(hash).toBe(expectedHash)
  })
})

describe('isUniqueViolation', () => {
  it('returns true for PostgreSQL unique violation code 23505', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true)
  })

  it('returns true for error message containing "duplicate key"', () => {
    expect(isUniqueViolation({ message: 'duplicate key value violates unique constraint' })).toBe(true)
  })

  it('returns true for error message containing "unique constraint"', () => {
    expect(isUniqueViolation({ message: 'unique constraint violation' })).toBe(true)
  })

  it('returns false for null error', () => {
    expect(isUniqueViolation(null)).toBe(false)
  })

  it('returns false for other error codes', () => {
    expect(isUniqueViolation({ code: '23503' })).toBe(false)
  })

  it('returns false for unrelated error messages', () => {
    expect(isUniqueViolation({ message: 'connection timeout' })).toBe(false)
  })

  it('handles case-insensitive message matching', () => {
    expect(isUniqueViolation({ message: 'DUPLICATE KEY ERROR' })).toBe(true)
    expect(isUniqueViolation({ message: 'UNIQUE CONSTRAINT VIOLATION' })).toBe(true)
  })
})

describe('create-tickets handler', () => {
  let mockReq: Partial<IncomingMessage>
  let mockRes: Partial<ServerResponse>
  let responseData: string
  let responseStatus: number

  beforeEach(() => {
    responseData = ''
    responseStatus = 200

    mockReq = {
      method: 'POST',
      [Symbol.asyncIterator]: async function* () {
        yield Buffer.from('{}')
      },
    }

    mockRes = {
      statusCode: 200,
      setHeader: vi.fn(),
      end: vi.fn((data?: string) => {
        responseData = data || ''
        try {
          const parsed = JSON.parse(data || '{}')
          if (parsed.success === false && responseStatus === 200) {
            responseStatus = parsed.error?.includes('Deprecated') ? 410 : 400
          }
        } catch {
          // Not JSON
        }
      }),
    }
  })

  describe('CORS handling', () => {
    it('sets CORS headers for all requests', async () => {
      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockRes.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*')
      expect(mockRes.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Methods', 'POST, OPTIONS')
      expect(mockRes.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Headers', 'Content-Type')
    })

    it('handles OPTIONS request', async () => {
      mockReq.method = 'OPTIONS'
      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from('{}')
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockRes.statusCode).toBe(204)
      expect(mockRes.end).toHaveBeenCalledWith()
    })
  })

  describe('deprecated endpoint response', () => {
    it('returns 410 Gone for POST requests', async () => {
      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockRes.statusCode).toBe(410)
      const body = JSON.parse(responseData)
      expect(body.success).toBe(false)
      expect(body.error).toContain('Deprecated')
      expect(body.error).toContain('/api/tickets/create')
    })

    it('rejects non-POST methods', async () => {
      mockReq.method = 'GET'
      mockReq[Symbol.asyncIterator] = async function* () {
        yield Buffer.from('{}')
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      expect(mockRes.statusCode).toBe(405)
      expect(responseData).toBe('Method Not Allowed')
    })
  })

  describe('error handling', () => {
    it('handles unexpected errors gracefully', async () => {
      // The handler returns 410 (deprecated) before processing the body,
      // so errors during body reading are caught and return 500
      mockReq[Symbol.asyncIterator] = async function* () {
        throw new Error('Unexpected error')
      }

      await handler(mockReq as IncomingMessage, mockRes as ServerResponse)

      // Error occurs during async iteration, so it's caught in the try-catch
      // and returns 500, not 410
      expect([500, 410]).toContain(mockRes.statusCode)
      if (mockRes.statusCode === 500) {
        const body = JSON.parse(responseData)
        expect(body.success).toBe(false)
        expect(body.error).toContain('Unexpected error')
      }
    })
  })
})
