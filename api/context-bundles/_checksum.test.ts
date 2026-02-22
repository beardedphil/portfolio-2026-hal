import { describe, it, expect } from 'vitest'
import {
  generateContentChecksum,
  generateBundleChecksum,
  calculateSectionMetrics,
  calculateTotalCharacters,
  calculateTotalCharactersFromBundle,
} from './_checksum.js'

describe('generateContentChecksum', () => {
  it('generates checksum for simple object', () => {
    const obj = { a: 1, b: 2 }
    const checksum = generateContentChecksum(obj)
    expect(checksum).toMatch(/^[0-9a-f]{64}$/)
  })

  it('produces consistent checksums for same input', () => {
    const obj = { a: 1, b: 2 }
    const checksum1 = generateContentChecksum(obj)
    const checksum2 = generateContentChecksum(obj)
    expect(checksum1).toBe(checksum2)
  })

  it('produces same checksum regardless of key order', () => {
    const obj1 = { a: 1, b: 2 }
    const obj2 = { b: 2, a: 1 }
    const checksum1 = generateContentChecksum(obj1)
    const checksum2 = generateContentChecksum(obj2)
    expect(checksum1).toBe(checksum2)
  })

  it('produces different checksums for different inputs', () => {
    const obj1 = { a: 1, b: 2 }
    const obj2 = { a: 1, b: 3 }
    const checksum1 = generateContentChecksum(obj1)
    const checksum2 = generateContentChecksum(obj2)
    expect(checksum1).not.toBe(checksum2)
  })

  it('handles arrays', () => {
    const arr = [1, 2, 3]
    const checksum = generateContentChecksum(arr)
    expect(checksum).toMatch(/^[0-9a-f]{64}$/)
  })

  it('handles nested objects', () => {
    const obj = { a: { b: 1 }, c: 2 }
    const checksum = generateContentChecksum(obj)
    expect(checksum).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('generateBundleChecksum', () => {
  it('generates checksum with metadata', () => {
    const bundle = { content: 'test' }
    const metadata = {
      repoFullName: 'owner/repo',
      ticketPk: 'pk-123',
      ticketId: '123',
      role: 'implementation',
      version: 1,
    }
    const checksum = generateBundleChecksum(bundle, metadata)
    expect(checksum).toMatch(/^[0-9a-f]{64}$/)
  })

  it('produces consistent checksums for same input', () => {
    const bundle = { content: 'test' }
    const metadata = {
      repoFullName: 'owner/repo',
      ticketPk: 'pk-123',
      ticketId: '123',
      role: 'implementation',
      version: 1,
    }
    const checksum1 = generateBundleChecksum(bundle, metadata)
    const checksum2 = generateBundleChecksum(bundle, metadata)
    expect(checksum1).toBe(checksum2)
  })

  it('produces different checksums for different metadata', () => {
    const bundle = { content: 'test' }
    const metadata1 = {
      repoFullName: 'owner/repo1',
      ticketPk: 'pk-123',
      ticketId: '123',
      role: 'implementation',
      version: 1,
    }
    const metadata2 = {
      repoFullName: 'owner/repo2',
      ticketPk: 'pk-123',
      ticketId: '123',
      role: 'implementation',
      version: 1,
    }
    const checksum1 = generateBundleChecksum(bundle, metadata1)
    const checksum2 = generateBundleChecksum(bundle, metadata2)
    expect(checksum1).not.toBe(checksum2)
  })
})

describe('calculateSectionMetrics', () => {
  it('calculates metrics for bundle sections', () => {
    const bundle = {
      meta: { version: 1 },
      ticket: { id: '123' },
      repo_context: { files: [] },
    }
    const metrics = calculateSectionMetrics(bundle)
    expect(metrics.meta).toBeGreaterThan(0)
    expect(metrics.ticket).toBeGreaterThan(0)
    expect(metrics.repo_context).toBeGreaterThan(0)
  })

  it('only includes metrics for sections present in bundle', () => {
    const bundle = { meta: { version: 1 } }
    const metrics = calculateSectionMetrics(bundle)
    expect(metrics.meta).toBeGreaterThan(0)
    expect(metrics.ticket).toBeUndefined() // Not included if not in bundle
  })

  it('handles null sections', () => {
    const bundle = { meta: null, ticket: { id: '123' } }
    const metrics = calculateSectionMetrics(bundle)
    expect(metrics.meta).toBe(0)
    expect(metrics.ticket).toBeGreaterThan(0)
  })

  it('handles empty bundle', () => {
    const bundle = {}
    const metrics = calculateSectionMetrics(bundle)
    expect(metrics).toEqual({}) // Empty bundle returns empty metrics
  })
})

describe('calculateTotalCharacters', () => {
  it('sums section metrics', () => {
    const metrics = { section1: 100, section2: 200, section3: 50 }
    const total = calculateTotalCharacters(metrics)
    expect(total).toBe(350)
  })

  it('returns zero for empty metrics', () => {
    const total = calculateTotalCharacters({})
    expect(total).toBe(0)
  })

  it('handles zero values', () => {
    const metrics = { section1: 0, section2: 100 }
    const total = calculateTotalCharacters(metrics)
    expect(total).toBe(100)
  })
})

describe('calculateTotalCharactersFromBundle', () => {
  it('calculates total from bundle JSON', () => {
    const bundle = { a: 1, b: 'test' }
    const total = calculateTotalCharactersFromBundle(bundle)
    expect(total).toBeGreaterThan(0)
  })

  it('matches JSON.stringify length', () => {
    const bundle = { a: 1, b: 'test' }
    const total = calculateTotalCharactersFromBundle(bundle)
    const expected = JSON.stringify(bundle).length
    expect(total).toBe(expected)
  })

  it('handles empty bundle', () => {
    const bundle = {}
    const total = calculateTotalCharactersFromBundle(bundle)
    expect(total).toBe(2) // "{}"
  })
})
