import { describe, it, expect } from 'vitest'
import { generateRedChecksum } from './_checksum.js'

describe('generateRedChecksum', () => {
  it('generates checksum for simple object', () => {
    const obj = { a: 1, b: 2 }
    const checksum = generateRedChecksum(obj)
    expect(checksum).toMatch(/^[0-9a-f]{64}$/)
  })

  it('produces consistent checksums for same input', () => {
    const obj = { a: 1, b: 2 }
    const checksum1 = generateRedChecksum(obj)
    const checksum2 = generateRedChecksum(obj)
    expect(checksum1).toBe(checksum2)
  })

  it('produces same checksum regardless of key order', () => {
    const obj1 = { a: 1, b: 2 }
    const obj2 = { b: 2, a: 1 }
    const checksum1 = generateRedChecksum(obj1)
    const checksum2 = generateRedChecksum(obj2)
    expect(checksum1).toBe(checksum2)
  })

  it('produces different checksums for different inputs', () => {
    const obj1 = { a: 1, b: 2 }
    const obj2 = { a: 1, b: 3 }
    const checksum1 = generateRedChecksum(obj1)
    const checksum2 = generateRedChecksum(obj2)
    expect(checksum1).not.toBe(checksum2)
  })

  it('handles arrays', () => {
    const arr = [1, 2, 3]
    const checksum = generateRedChecksum(arr)
    expect(checksum).toMatch(/^[0-9a-f]{64}$/)
  })

  it('handles nested objects', () => {
    const obj = { a: { b: 1 }, c: 2 }
    const checksum = generateRedChecksum(obj)
    expect(checksum).toMatch(/^[0-9a-f]{64}$/)
  })

  it('handles null', () => {
    const checksum = generateRedChecksum(null)
    expect(checksum).toMatch(/^[0-9a-f]{64}$/)
  })

  it('handles primitives', () => {
    expect(generateRedChecksum(true)).toMatch(/^[0-9a-f]{64}$/)
    expect(generateRedChecksum(false)).toMatch(/^[0-9a-f]{64}$/)
    expect(generateRedChecksum(123)).toMatch(/^[0-9a-f]{64}$/)
    expect(generateRedChecksum('string')).toMatch(/^[0-9a-f]{64}$/)
  })
})
