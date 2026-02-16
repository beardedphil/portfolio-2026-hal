import { describe, it, expect } from 'vitest'
import { readJsonBody } from './request-utils'
import { Readable } from 'stream'

describe('readJsonBody', () => {
  it('should parse valid JSON body', async () => {
    const req = new Readable({
      read() {
        this.push(JSON.stringify({ message: 'test', value: 123 }))
        this.push(null)
      },
    }) as import('http').IncomingMessage

    const result = await readJsonBody(req)
    expect(result).toEqual({ message: 'test', value: 123 })
  })

  it('should handle empty body', async () => {
    const req = new Readable({
      read() {
        this.push('')
        this.push(null)
      },
    }) as import('http').IncomingMessage

    const result = await readJsonBody(req)
    expect(result).toEqual({})
  })

  it('should handle body with multiple chunks', async () => {
    const chunks = ['{"message":', '"test",', '"value":', '123}']
    let chunkIndex = 0
    const req = new Readable({
      read() {
        if (chunkIndex < chunks.length) {
          this.push(chunks[chunkIndex])
          chunkIndex++
        } else {
          this.push(null)
        }
      },
    }) as import('http').IncomingMessage

    const result = await readJsonBody(req)
    expect(result).toEqual({ message: 'test', value: 123 })
  })

  it('should reject on invalid JSON', async () => {
    const req = new Readable({
      read() {
        this.push('invalid json')
        this.push(null)
      },
    }) as import('http').IncomingMessage

    await expect(readJsonBody(req)).rejects.toThrow()
  })

  it('should reject on request error', async () => {
    const req = new Readable({
      read() {
        this.emit('error', new Error('Request error'))
      },
    }) as import('http').IncomingMessage

    await expect(readJsonBody(req)).rejects.toThrow('Request error')
  })
})
