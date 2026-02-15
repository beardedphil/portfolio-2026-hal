import { describe, it, expect } from 'vitest'
import type { IncomingMessage } from 'http'
import { readJsonBody, validateMethod, parseRequestBody, validateMessageOrImages } from './request-parsing.js'

describe('request-parsing', () => {
  describe('readJsonBody', () => {
    it('should parse valid JSON body', async () => {
      const req = {
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from(JSON.stringify({ message: 'test', projectId: '123' }))
        },
      } as unknown as IncomingMessage

      const result = await readJsonBody(req)

      expect(result).toEqual({ message: 'test', projectId: '123' })
    })

    it('should return empty object for empty body', async () => {
      const req = {
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from('')
        },
      } as unknown as IncomingMessage

      const result = await readJsonBody(req)

      expect(result).toEqual({})
    })

    it('should handle string chunks', async () => {
      const req = {
        [Symbol.asyncIterator]: async function* () {
          yield '{"test": "value"}'
        },
      } as unknown as IncomingMessage

      const result = await readJsonBody(req)

      expect(result).toEqual({ test: 'value' })
    })

    it('should handle multiple chunks', async () => {
      const req = {
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from('{"test": ')
          yield Buffer.from('"value"}')
        },
      } as unknown as IncomingMessage

      const result = await readJsonBody(req)

      expect(result).toEqual({ test: 'value' })
    })

    it('should throw on invalid JSON', async () => {
      const req = {
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from('invalid json{')
        },
      } as unknown as IncomingMessage

      await expect(readJsonBody(req)).rejects.toThrow()
    })
  })

  describe('validateMethod', () => {
    it('should return true for POST', () => {
      expect(validateMethod('POST')).toBe(true)
    })

    it('should return false for GET', () => {
      expect(validateMethod('GET')).toBe(false)
    })

    it('should return false for PUT', () => {
      expect(validateMethod('PUT')).toBe(false)
    })

    it('should return false for undefined', () => {
      expect(validateMethod(undefined)).toBe(false)
    })
  })

  describe('parseRequestBody', () => {
    it('should parse valid request body', () => {
      const body = {
        message: 'test message',
        conversationHistory: [{ role: 'user', content: 'hello' }],
        previous_response_id: 'resp-123',
        projectId: 'proj-456',
        conversationId: 'conv-789',
        repoFullName: 'owner/repo',
        supabaseUrl: 'https://example.com',
        supabaseAnonKey: 'anon-key',
        images: [{ dataUrl: 'data:image/png;base64,xxx', filename: 'test.png', mimeType: 'image/png' }],
      }

      const result = parseRequestBody(body)

      expect(result.message).toBe('test message')
      expect(result.conversationHistory).toEqual([{ role: 'user', content: 'hello' }])
      expect(result.previous_response_id).toBe('resp-123')
      expect(result.projectId).toBe('proj-456')
      expect(result.conversationId).toBe('conv-789')
      expect(result.repoFullName).toBe('owner/repo')
      expect(result.supabaseUrl).toBe('https://example.com')
      expect(result.supabaseAnonKey).toBe('anon-key')
      expect(result.images).toEqual([{ dataUrl: 'data:image/png;base64,xxx', filename: 'test.png', mimeType: 'image/png' }])
    })

    it('should handle missing fields', () => {
      const body = {}

      const result = parseRequestBody(body)

      expect(result.message).toBe('')
      expect(result.conversationHistory).toBeUndefined()
      expect(result.previous_response_id).toBeUndefined()
      expect(result.projectId).toBeUndefined()
    })

    it('should trim and normalize string fields', () => {
      const body = {
        projectId: '  proj-123  ',
        repoFullName: '  owner/repo  ',
        supabaseUrl: '  https://example.com  ',
      }

      const result = parseRequestBody(body)

      expect(result.projectId).toBe('proj-123')
      expect(result.repoFullName).toBe('owner/repo')
      expect(result.supabaseUrl).toBe('https://example.com')
    })

    it('should convert empty trimmed strings to undefined', () => {
      const body = {
        projectId: '   ',
        repoFullName: '',
      }

      const result = parseRequestBody(body)

      expect(result.projectId).toBeUndefined()
      expect(result.repoFullName).toBeUndefined()
    })

    it('should handle invalid conversationHistory', () => {
      const body = {
        conversationHistory: 'not an array',
      }

      const result = parseRequestBody(body)

      expect(result.conversationHistory).toBeUndefined()
    })

    it('should handle invalid images', () => {
      const body = {
        images: 'not an array',
      }

      const result = parseRequestBody(body)

      expect(result.images).toBeUndefined()
    })
  })

  describe('validateMessageOrImages', () => {
    it('should return undefined when message is present', () => {
      const result = validateMessageOrImages('test message')
      expect(result).toBeUndefined()
    })

    it('should return undefined when images are present', () => {
      const images = [{ dataUrl: 'data:image/png;base64,xxx', filename: 'test.png', mimeType: 'image/png' }]
      const result = validateMessageOrImages('', images)
      expect(result).toBeUndefined()
    })

    it('should return undefined when both message and images are present', () => {
      const images = [{ dataUrl: 'data:image/png;base64,xxx', filename: 'test.png', mimeType: 'image/png' }]
      const result = validateMessageOrImages('test message', images)
      expect(result).toBeUndefined()
    })

    it('should return error when neither message nor images are present', () => {
      const result = validateMessageOrImages('')
      expect(result).toBe('Message is required (or attach an image)')
    })

    it('should return error when message is only whitespace and no images', () => {
      const result = validateMessageOrImages('   ')
      expect(result).toBe('Message is required (or attach an image)')
    })

    it('should return error when images array is empty', () => {
      const result = validateMessageOrImages('', [])
      expect(result).toBe('Message is required (or attach an image)')
    })
  })
})
