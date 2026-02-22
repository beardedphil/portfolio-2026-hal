import { describe, it, expect, vi } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'http'
import { readJsonBody, json, setCorsHeaders, handleOptionsRequest } from './_http-utils.js'

describe('readJsonBody', () => {
  it('should parse valid JSON body', async () => {
    const body = { ticketId: '123', title: 'Test' }
    const req = {
      [Symbol.asyncIterator]: async function* () {
        yield Buffer.from(JSON.stringify(body))
      },
    } as unknown as IncomingMessage

    const result = await readJsonBody(req, 'test-endpoint')
    expect(result).toEqual(body)
  })

  it('should handle empty body', async () => {
    const req = {
      [Symbol.asyncIterator]: async function* () {
        yield Buffer.from('')
      },
    } as unknown as IncomingMessage

    const result = await readJsonBody(req, 'test-endpoint')
    expect(result).toEqual({})
  })

  it('should handle whitespace-only body', async () => {
    const req = {
      [Symbol.asyncIterator]: async function* () {
        yield Buffer.from('   \n\t  ')
      },
    } as unknown as IncomingMessage

    const result = await readJsonBody(req, 'test-endpoint')
    expect(result).toEqual({})
  })

  it('should handle multiple chunks', async () => {
    const body = { ticketId: '123', title: 'Test' }
    const jsonStr = JSON.stringify(body)
    const chunk1 = jsonStr.substring(0, 10)
    const chunk2 = jsonStr.substring(10)
    
    const req = {
      [Symbol.asyncIterator]: async function* () {
        yield Buffer.from(chunk1)
        yield Buffer.from(chunk2)
      },
    } as unknown as IncomingMessage

    const result = await readJsonBody(req, 'test-endpoint')
    expect(result).toEqual(body)
  })

  it('should handle string chunks', async () => {
    const body = { ticketId: '123' }
    const req = {
      [Symbol.asyncIterator]: async function* () {
        yield JSON.stringify(body)
      },
    } as unknown as IncomingMessage

    const result = await readJsonBody(req, 'test-endpoint')
    expect(result).toEqual(body)
  })

  it('should throw error for invalid JSON', async () => {
    const req = {
      [Symbol.asyncIterator]: async function* () {
        yield Buffer.from('{ invalid json }')
      },
    } as unknown as IncomingMessage

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(readJsonBody(req, 'test-endpoint')).rejects.toThrow('Failed to parse request body as JSON')
    
    expect(consoleErrorSpy).toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })

  it('should log error details on parse failure', async () => {
    const invalidJson = '{ "key": "value"'
    const req = {
      [Symbol.asyncIterator]: async function* () {
        yield Buffer.from(invalidJson)
      },
    } as unknown as IncomingMessage

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(readJsonBody(req, 'test-endpoint')).rejects.toThrow()
    
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[test-endpoint] JSON parse error:')
    )
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[test-endpoint] Raw body length:')
    )
    
    consoleErrorSpy.mockRestore()
  })
})

describe('json', () => {
  it('should send JSON response with status code', () => {
    const res = {
      statusCode: 0,
      setHeader: vi.fn(),
      end: vi.fn(),
    } as unknown as ServerResponse

    const body = { success: true, data: 'test' }
    json(res, 200, body)

    expect(res.statusCode).toBe(200)
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json')
    expect(res.end).toHaveBeenCalledWith(JSON.stringify(body))
  })

  it('should handle different status codes', () => {
    const res = {
      statusCode: 0,
      setHeader: vi.fn(),
      end: vi.fn(),
    } as unknown as ServerResponse

    json(res, 404, { error: 'Not found' })

    expect(res.statusCode).toBe(404)
    expect(res.end).toHaveBeenCalledWith(JSON.stringify({ error: 'Not found' }))
  })

  it('should handle null and undefined in body', () => {
    const res = {
      statusCode: 0,
      setHeader: vi.fn(),
      end: vi.fn(),
    } as unknown as ServerResponse

    json(res, 200, null)
    expect(res.end).toHaveBeenCalledWith('null')

    json(res, 200, undefined)
    expect(res.end).toHaveBeenCalledWith(JSON.stringify(undefined))
  })
})

describe('setCorsHeaders', () => {
  it('should set CORS headers', () => {
    const res = {
      setHeader: vi.fn(),
    } as unknown as ServerResponse

    setCorsHeaders(res)

    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*')
    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Methods', 'POST, OPTIONS')
    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Headers', 'Content-Type')
  })
})

describe('handleOptionsRequest', () => {
  it('should set status code to 204 and end response', () => {
    const res = {
      statusCode: 0,
      end: vi.fn(),
    } as unknown as ServerResponse

    handleOptionsRequest(res)

    expect(res.statusCode).toBe(204)
    expect(res.end).toHaveBeenCalled()
  })
})
