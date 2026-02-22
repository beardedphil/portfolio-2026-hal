import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { requireEnv, getOrigin } from './config.js'

describe('requireEnv', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('returns trimmed value when env var exists', () => {
    process.env.TEST_VAR = '  test-value  '
    expect(requireEnv('TEST_VAR')).toBe('test-value')
  })

  it('throws error when env var is missing', () => {
    delete process.env.TEST_VAR
    expect(() => requireEnv('TEST_VAR')).toThrow('Missing TEST_VAR in environment')
  })

  it('throws error when env var is empty string', () => {
    process.env.TEST_VAR = ''
    expect(() => requireEnv('TEST_VAR')).toThrow('Missing TEST_VAR in environment')
  })

  it('throws error when env var is only whitespace', () => {
    process.env.TEST_VAR = '   '
    expect(() => requireEnv('TEST_VAR')).toThrow('Missing TEST_VAR in environment')
  })
})

describe('getOrigin', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.APP_ORIGIN
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('uses APP_ORIGIN when set', () => {
    process.env.APP_ORIGIN = 'https://example.com/'
    const req = { headers: {} }
    expect(getOrigin(req)).toBe('https://example.com')
  })

  it('removes trailing slashes from APP_ORIGIN', () => {
    process.env.APP_ORIGIN = 'https://example.com///'
    const req = { headers: {} }
    expect(getOrigin(req)).toBe('https://example.com')
  })

  it('uses x-forwarded-host and x-forwarded-proto when available', () => {
    const req = {
      headers: {
        'x-forwarded-host': 'example.com',
        'x-forwarded-proto': 'https',
      },
    }
    expect(getOrigin(req)).toBe('https://example.com')
  })

  it('uses host header when x-forwarded-host is not available', () => {
    const req = {
      headers: {
        host: 'example.com',
      },
    }
    expect(getOrigin(req)).toBe('http://example.com')
  })

  it('defaults to http when x-forwarded-proto is not available', () => {
    const req = {
      headers: {
        host: 'example.com',
      },
    }
    expect(getOrigin(req)).toBe('http://example.com')
  })

  it('handles Headers object', () => {
    const headers = new Headers()
    headers.set('host', 'example.com')
    const req = { headers }
    expect(getOrigin(req)).toBe('http://example.com')
  })

  it('handles lowercase header lookup', () => {
    const req = {
      headers: {
        host: 'example.com',
      },
    }
    expect(getOrigin(req)).toBe('http://example.com')
  })

  it('throws error when no host header is available', () => {
    const req = { headers: {} }
    expect(() => getOrigin(req)).toThrow('Cannot determine origin')
  })

  it('removes trailing slashes from constructed origin', () => {
    const req = {
      headers: {
        host: 'example.com',
      },
    }
    expect(getOrigin(req)).toBe('http://example.com')
  })
})
