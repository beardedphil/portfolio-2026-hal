import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { stableColumnId } from './stableColumnId'

describe('stableColumnId', () => {
  let originalCrypto: Crypto | undefined
  let cryptoDescriptor: PropertyDescriptor | undefined

  beforeEach(() => {
    // Save original crypto
    originalCrypto = globalThis.crypto
    // Get the property descriptor if it exists
    cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto')
  })

  afterEach(() => {
    // Restore original crypto
    if (cryptoDescriptor) {
      Object.defineProperty(globalThis, 'crypto', cryptoDescriptor)
    } else if (originalCrypto) {
      Object.defineProperty(globalThis, 'crypto', {
        value: originalCrypto,
        writable: true,
        configurable: true,
      })
    } else {
      delete (globalThis as any).crypto
    }
  })

  describe('non-empty string output', () => {
    it('returns a non-empty string when crypto.randomUUID exists', () => {
      // Mock crypto.randomUUID
      const mockUUID = '123e4567-e89b-12d3-a456-426614174000'
      Object.defineProperty(globalThis, 'crypto', {
        value: {
          randomUUID: () => mockUUID,
        },
        writable: true,
        configurable: true,
      })

      const result = stableColumnId()
      
      expect(result).toBe(mockUUID)
      expect(result.length).toBeGreaterThan(0)
      expect(typeof result).toBe('string')
    })

    it('returns a non-empty string when using fallback path', () => {
      // Remove crypto.randomUUID
      delete (globalThis as any).crypto

      const result = stableColumnId()
      
      expect(result.length).toBeGreaterThan(0)
      expect(typeof result).toBe('string')
      expect(result).toMatch(/^col-\d+-[a-z0-9]+$/)
    })
  })

  describe('stable shape with crypto.randomUUID', () => {
    it('returns UUID format when crypto.randomUUID exists', () => {
      const mockUUID = '123e4567-e89b-12d3-a456-426614174000'
      Object.defineProperty(globalThis, 'crypto', {
        value: {
          randomUUID: () => mockUUID,
        },
        writable: true,
        configurable: true,
      })

      const result = stableColumnId()
      
      // UUID format: 8-4-4-4-12 hex digits with dashes
      expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
      expect(result).toBe(mockUUID)
    })

    it('returns different UUIDs on each call', () => {
      let callCount = 0
      const uuids = [
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
        '33333333-3333-3333-3333-333333333333',
      ]
      
      Object.defineProperty(globalThis, 'crypto', {
        value: {
          randomUUID: () => uuids[callCount++],
        },
        writable: true,
        configurable: true,
      })

      const id1 = stableColumnId()
      const id2 = stableColumnId()
      const id3 = stableColumnId()
      
      expect(id1).toBe(uuids[0])
      expect(id2).toBe(uuids[1])
      expect(id3).toBe(uuids[2])
      expect(id1).not.toBe(id2)
      expect(id2).not.toBe(id3)
    })
  })

  describe('stable shape with fallback path', () => {
    it('returns col-timestamp-random format when crypto.randomUUID does not exist', () => {
      delete (globalThis as any).crypto

      const result = stableColumnId()
      
      // Format: col-<timestamp>-<random>
      expect(result).toMatch(/^col-\d+-[a-z0-9]+$/)
      expect(result.startsWith('col-')).toBe(true)
    })

    it('returns different IDs on each call (fallback)', () => {
      delete (globalThis as any).crypto

      // Use fake timers to control Date.now()
      vi.useFakeTimers()
      
      let timestamp = 1000000
      vi.setSystemTime(timestamp)

      // Mock Math.random to return predictable values
      const randomValues = [0.1, 0.2, 0.3]
      let randomIndex = 0
      const originalRandom = Math.random
      Math.random = () => randomValues[randomIndex++ % randomValues.length]

      const id1 = stableColumnId()
      
      timestamp += 1000
      vi.setSystemTime(timestamp)
      const id2 = stableColumnId()
      
      timestamp += 1000
      vi.setSystemTime(timestamp)
      const id3 = stableColumnId()

      // Restore
      Math.random = originalRandom
      vi.useRealTimers()

      expect(id1).not.toBe(id2)
      expect(id2).not.toBe(id3)
      expect(id1).toMatch(/^col-1000000-/)
      expect(id2).toMatch(/^col-1001000-/)
      expect(id3).toMatch(/^col-1002000-/)
    })

    it('includes random suffix in fallback format', () => {
      delete (globalThis as any).crypto

      const result = stableColumnId()
      
      // Should have format: col-<timestamp>-<random>
      const parts = result.split('-')
      expect(parts.length).toBeGreaterThanOrEqual(3)
      expect(parts[0]).toBe('col')
      expect(parts[1]).toMatch(/^\d+$/) // timestamp
      expect(parts.slice(2).join('-')).toMatch(/^[a-z0-9]+$/) // random part
    })
  })

  describe('crypto detection', () => {
    it('uses crypto.randomUUID when crypto exists and has randomUUID', () => {
      const mockUUID = 'test-uuid-12345'
      Object.defineProperty(globalThis, 'crypto', {
        value: {
          randomUUID: () => mockUUID,
        },
        writable: true,
        configurable: true,
      })

      const result = stableColumnId()
      
      expect(result).toBe(mockUUID)
    })

    it('uses fallback when crypto exists but randomUUID is missing', () => {
      Object.defineProperty(globalThis, 'crypto', {
        value: {},
        writable: true,
        configurable: true,
      })

      const result = stableColumnId()
      
      expect(result).toMatch(/^col-\d+-[a-z0-9]+$/)
    })

    it('uses fallback when crypto is undefined', () => {
      delete (globalThis as any).crypto

      const result = stableColumnId()
      
      expect(result).toMatch(/^col-\d+-[a-z0-9]+$/)
    })

    it('uses fallback when crypto is null', () => {
      // Simulate crypto being null
      Object.defineProperty(globalThis, 'crypto', {
        value: null,
        writable: true,
        configurable: true,
      })

      const result = stableColumnId()
      
      expect(result).toMatch(/^col-\d+-[a-z0-9]+$/)
    })
  })
})
