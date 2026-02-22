import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { encryptSecret, decryptSecret, isEncrypted } from './encryption.js'

describe('encryption', () => {
  const originalEnv = process.env.HAL_ENCRYPTION_KEY

  beforeEach(() => {
    // Set a test encryption key
    process.env.HAL_ENCRYPTION_KEY = 'test-encryption-key-minimum-32-chars-long-for-testing'
  })

  afterEach(() => {
    if (originalEnv) {
      process.env.HAL_ENCRYPTION_KEY = originalEnv
    } else {
      delete process.env.HAL_ENCRYPTION_KEY
    }
  })

  describe('encryptSecret', () => {
    it('should encrypt a plaintext string', () => {
      const plaintext = 'my-secret-token-12345'
      const encrypted = encryptSecret(plaintext)
      expect(encrypted).toBeTruthy()
      expect(encrypted).not.toBe(plaintext)
      expect(typeof encrypted).toBe('string')
    })

    it('should produce different ciphertext for same plaintext (due to random IV)', () => {
      const plaintext = 'same-secret'
      const encrypted1 = encryptSecret(plaintext)
      const encrypted2 = encryptSecret(plaintext)
      expect(encrypted1).not.toBe(encrypted2) // Different IVs produce different ciphertext
    })

    it('should throw error if HAL_ENCRYPTION_KEY is missing', () => {
      delete process.env.HAL_ENCRYPTION_KEY
      expect(() => encryptSecret('test')).toThrow('HAL_ENCRYPTION_KEY is missing')
    })

    it('should throw error if HAL_ENCRYPTION_KEY is too short', () => {
      process.env.HAL_ENCRYPTION_KEY = 'short'
      expect(() => encryptSecret('test')).toThrow('HAL_ENCRYPTION_KEY is missing or too short')
    })

    it('should throw error for empty plaintext', () => {
      expect(() => encryptSecret('')).toThrow('Cannot encrypt: plaintext must be a non-empty string')
    })

    it('should throw error for non-string input', () => {
      expect(() => encryptSecret(null as any)).toThrow('Cannot encrypt: plaintext must be a non-empty string')
    })
  })

  describe('decryptSecret', () => {
    it('should decrypt encrypted data back to original', () => {
      const plaintext = 'my-secret-token-12345'
      const encrypted = encryptSecret(plaintext)
      const decrypted = decryptSecret(encrypted)
      expect(decrypted).toBe(plaintext)
    })

    it('should decrypt multiple different encryptions of same plaintext', () => {
      const plaintext = 'same-secret'
      const encrypted1 = encryptSecret(plaintext)
      const encrypted2 = encryptSecret(plaintext)
      expect(decryptSecret(encrypted1)).toBe(plaintext)
      expect(decryptSecret(encrypted2)).toBe(plaintext)
    })

    it('should throw error if HAL_ENCRYPTION_KEY is missing', () => {
      const encrypted = encryptSecret('test')
      delete process.env.HAL_ENCRYPTION_KEY
      expect(() => decryptSecret(encrypted)).toThrow('HAL_ENCRYPTION_KEY is missing')
    })

    it('should throw error for wrong encryption key', () => {
      const plaintext = 'test-secret'
      const encrypted = encryptSecret(plaintext)
      process.env.HAL_ENCRYPTION_KEY = 'different-key-minimum-32-chars-long-for-testing'
      expect(() => decryptSecret(encrypted)).toThrow('Decryption failed')
    })

    it('should throw error for corrupted data', () => {
      expect(() => decryptSecret('not-valid-base64!!!')).toThrow('Decryption failed')
    })

    it('should throw error for empty string', () => {
      expect(() => decryptSecret('')).toThrow('Cannot decrypt: encrypted data must be a non-empty string')
    })

    it('should throw error for too-short data', () => {
      expect(() => decryptSecret('dGVzdA==')).toThrow('Invalid encrypted data: too short')
    })
  })

  describe('isEncrypted', () => {
    it('should return true for encrypted data', () => {
      const plaintext = 'test-secret'
      const encrypted = encryptSecret(plaintext)
      expect(isEncrypted(encrypted)).toBe(true)
    })

    it('should return false for plaintext', () => {
      expect(isEncrypted('plain-token-123')).toBe(false)
    })

    it('should return false for empty string', () => {
      expect(isEncrypted('')).toBe(false)
    })

    it('should return false for invalid base64', () => {
      expect(isEncrypted('not-base64!!!')).toBe(false)
    })

    it('should return false for too-short base64', () => {
      expect(isEncrypted('dGVzdA==')).toBe(false) // "test" in base64, but too short for encrypted data
    })
  })
})
