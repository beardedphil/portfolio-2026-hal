import { describe, it, expect } from 'vitest'
import { humanReadableCursorError, readJsonBody } from './helpers'
import { IncomingMessage } from 'http'
import { Readable } from 'stream'

describe('humanReadableCursorError', () => {
  it('returns authentication error for 401', () => {
    expect(humanReadableCursorError(401)).toBe(
      'Cursor API authentication failed. Check that CURSOR_API_KEY is valid.'
    )
  })

  it('returns access denied error for 403', () => {
    expect(humanReadableCursorError(403)).toBe(
      'Cursor API access denied. Your plan may not include Cloud Agents API.'
    )
  })

  it('returns rate limit error for 429', () => {
    expect(humanReadableCursorError(429)).toBe(
      'Cursor API rate limit exceeded. Please try again in a moment.'
    )
  })

  it('returns server error for 500+', () => {
    expect(humanReadableCursorError(500)).toBe('Cursor API server error (500). Please try again later.')
    expect(humanReadableCursorError(503)).toBe('Cursor API server error (503). Please try again later.')
  })

  it('returns generic error for other status codes', () => {
    expect(humanReadableCursorError(400)).toBe('Cursor API request failed (400)')
    expect(humanReadableCursorError(404)).toBe('Cursor API request failed (404)')
  })

  it('includes detail when provided', () => {
    expect(humanReadableCursorError(400, 'Invalid request')).toBe(
      'Cursor API request failed (400) — Invalid request'
    )
  })

  it('truncates long details to 100 characters', () => {
    const longDetail = 'a'.repeat(150)
    const result = humanReadableCursorError(400, longDetail)
    expect(result).toContain('Cursor API request failed (400) —')
    expect(result.length).toBeLessThan(150) // Should be truncated
  })
})

describe('readJsonBody', () => {
  it('parses valid JSON body', async () => {
    const req = new Readable({
      read() {
        this.push(Buffer.from(JSON.stringify({ test: 'value' })))
        this.push(null)
      },
    }) as IncomingMessage

    const result = await readJsonBody(req)
    expect(result).toEqual({ test: 'value' })
  })

  it('handles empty body', async () => {
    const req = new Readable({
      read() {
        this.push(null)
      },
    }) as IncomingMessage

    const result = await readJsonBody(req)
    expect(result).toEqual({})
  })

  it('rejects on invalid JSON', async () => {
    const req = new Readable({
      read() {
        this.push(Buffer.from('invalid json'))
        this.push(null)
      },
    }) as IncomingMessage

    await expect(readJsonBody(req)).rejects.toThrow()
  })

  it('handles chunked data', async () => {
    const req = new Readable({
      read() {
        this.push(Buffer.from('{"test":'))
        this.push(Buffer.from('"value"}'))
        this.push(null)
      },
    }) as IncomingMessage

    const result = await readJsonBody(req)
    expect(result).toEqual({ test: 'value' })
  })

  it('rejects on stream error', async () => {
    const req = new Readable({
      read() {
        this.emit('error', new Error('Stream error'))
      },
    }) as IncomingMessage

    await expect(readJsonBody(req)).rejects.toThrow('Stream error')
  })
})
