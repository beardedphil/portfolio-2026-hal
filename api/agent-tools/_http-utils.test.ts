import { describe, it, expect, vi } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'http'
import { readJsonBody, json } from './_http-utils.js'

describe('readJsonBody', () => {
  it('should return empty object for empty body', async () => {
    const req = {
      [Symbol.asyncIterator]: async function* () {
        // Empty body
      },
    } as unknown as IncomingMessage

    const result = await readJsonBody(req)
    expect(result).toEqual({})
  })

  it('should parse valid JSON body', async () => {
    const jsonData = { tool: 'test', params: { ticketId: '123' } }
    const req = {
      [Symbol.asyncIterator]: async function* () {
        yield Buffer.from(JSON.stringify(jsonData))
      },
    } as unknown as IncomingMessage

    const result = await readJsonBody(req)
    expect(result).toEqual(jsonData)
  })

  it('should handle string chunks', async () => {
    const jsonData = { tool: 'test' }
    const req = {
      [Symbol.asyncIterator]: async function* () {
        yield JSON.stringify(jsonData)
      },
    } as unknown as IncomingMessage

    const result = await readJsonBody(req)
    expect(result).toEqual(jsonData)
  })

  it('should handle multiple chunks', async () => {
    const jsonData = { tool: 'test', params: { ticketId: '123' } }
    const jsonString = JSON.stringify(jsonData)
    const chunk1 = jsonString.substring(0, 10)
    const chunk2 = jsonString.substring(10)

    const req = {
      [Symbol.asyncIterator]: async function* () {
        yield Buffer.from(chunk1)
        yield Buffer.from(chunk2)
      },
    } as unknown as IncomingMessage

    const result = await readJsonBody(req)
    expect(result).toEqual(jsonData)
  })

  it('should trim whitespace', async () => {
    const jsonData = { tool: 'test' }
    const req = {
      [Symbol.asyncIterator]: async function* () {
        yield Buffer.from('  ' + JSON.stringify(jsonData) + '  ')
      },
    } as unknown as IncomingMessage

    const result = await readJsonBody(req)
    expect(result).toEqual(jsonData)
  })
})

describe('json', () => {
  it('should set status code and content type', () => {
    const res = {
      statusCode: 200,
      headers: {} as Record<string, string>,
      setHeader: vi.fn((name: string, value: string) => {
        res.headers[name] = value
      }),
      end: vi.fn(),
    } as unknown as ServerResponse

    const body = { success: true, data: 'test' }
    json(res, 200, body)

    expect(res.statusCode).toBe(200)
    expect(res.headers['Content-Type']).toBe('application/json')
    expect(res.end).toHaveBeenCalledWith(JSON.stringify(body))
  })

  it('should handle different status codes', () => {
    const res = {
      statusCode: 200,
      headers: {} as Record<string, string>,
      setHeader: vi.fn((name: string, value: string) => {
        res.headers[name] = value
      }),
      end: vi.fn(),
    } as unknown as ServerResponse

    json(res, 400, { success: false, error: 'Bad request' })

    expect(res.statusCode).toBe(400)
    expect(res.end).toHaveBeenCalledWith(JSON.stringify({ success: false, error: 'Bad request' }))
  })
})
