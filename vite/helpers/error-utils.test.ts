import { describe, it, expect } from 'vitest'
import { humanReadableCursorError } from './error-utils'

describe('humanReadableCursorError', () => {
  it('should return authentication error message for 401', () => {
    expect(humanReadableCursorError(401)).toBe(
      'Cursor API authentication failed. Check that CURSOR_API_KEY is valid.'
    )
  })

  it('should return access denied message for 403', () => {
    expect(humanReadableCursorError(403)).toBe(
      'Cursor API access denied. Your plan may not include Cloud Agents API.'
    )
  })

  it('should return rate limit message for 429', () => {
    expect(humanReadableCursorError(429)).toBe(
      'Cursor API rate limit exceeded. Please try again in a moment.'
    )
  })

  it('should return server error message for 500+', () => {
    expect(humanReadableCursorError(500)).toBe('Cursor API server error (500). Please try again later.')
    expect(humanReadableCursorError(503)).toBe('Cursor API server error (503). Please try again later.')
  })

  it('should return generic error message for other status codes', () => {
    expect(humanReadableCursorError(400)).toBe('Cursor API request failed (400)')
    expect(humanReadableCursorError(404)).toBe('Cursor API request failed (404)')
  })

  it('should include detail when provided', () => {
    expect(humanReadableCursorError(400, 'Invalid request')).toBe('Cursor API request failed (400) — Invalid request')
  })

  it('should truncate long details to 100 characters', () => {
    const longDetail = 'a'.repeat(150)
    const result = humanReadableCursorError(400, longDetail)
    expect(result).toBe(`Cursor API request failed (400) — ${'a'.repeat(100)}`)
    expect(result.length).toBeLessThanOrEqual(150) // Base message + truncated detail
  })
})
