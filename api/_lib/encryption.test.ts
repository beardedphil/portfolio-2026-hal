import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { encryptSecret, decryptSecret, isEncrypted } from './encryption.js'

describe('encryption', () => {
  const originalEnv = process.env.HAL_ENCRYPTION_KEY

  beforeEach(() => {
    // Set a test encryption key (64 hex chars = 32 bytes)
    process.env.HAL_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
  })

  afterEach(() => {
    if (originalEnv) {
      process.env.HAL_ENCRYPTION_KEY = originalEnv
    } else {
      delete process.env.HAL_ENCRYPTION_KEY
    }
  })

  describe('encryptSecret', () => {
    it('should encrypt a secret value', () => {
      const plaintext = 'my-secret-token-12345'
      const encrypted = encryptSecret(plaintext)

      expect(encrypted).toBeTruthy()
      expect(encrypted).not.toBe(plaintext)
      expect(encrypted.split(':')).toHaveLength(3) // iv:authTag:encryptedData
    })

    it('should produce different ciphertext for the same plaintext (due to random IV)', () => {
      const plaintext = 'same-secret'
      const encrypted1 = encryptSecret(plaintext)
      const encrypted2 = encryptSecret(plaintext)

      expect(encrypted1).not.toBe(encrypted2)
      // But both should decrypt to the same value
      expect(decryptSecret(encrypted1)).toBe(plaintext)
      expect(decryptSecret(encrypted2)).toBe(plaintext)
    })

    it('should throw error if HAL_ENCRYPTION_KEY is missing', () => {
      delete process.env.HAL_ENCRYPTION_KEY
      expect(() => encryptSecret('test')).toThrow('HAL_ENCRYPTION_KEY')
    })

    it('should throw error if plaintext is empty', () => {
      expect(() => encryptSecret('')).toThrow('non-empty string')
    })

    it('should throw error if plaintext is not a string', () => {
      expect(() => encryptSecret(null as any)).toThrow('non-empty string')
      expect(() => encryptSecret(undefined as any)).toThrow('non-empty string')
    })
  })

  describe('decryptSecret', () => {
    it('should decrypt an encrypted value back to plaintext', () => {
      const plaintext = 'my-secret-token-12345'
      const encrypted = encryptSecret(plaintext)
      const decrypted = decryptSecret(encrypted)

      expect(decrypted).toBe(plaintext)
    })

    it('should handle various secret formats', () => {
      const secrets = [
        'ghp_1234567890abcdef',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
        'sk-1234567890abcdef',
        'a'.repeat(100), // Long secret
      ]

      for (const secret of secrets) {
        const encrypted = encryptSecret(secret)
        const decrypted = decryptSecret(encrypted)
        expect(decrypted).toBe(secret)
      }
    })

    it('should throw error if encrypted value is invalid format', () => {
      expect(() => decryptSecret('invalid')).toThrow('Invalid encrypted format')
      expect(() => decryptSecret('part1:part2')).toThrow('Invalid encrypted format')
      expect(() => decryptSecret('part1:part2:part3:part4')).toThrow('Invalid encrypted format')
    })

    it('should throw error if HAL_ENCRYPTION_KEY is missing', () => {
      const encrypted = encryptSecret('test')
      delete process.env.HAL_ENCRYPTION_KEY
      expect(() => decryptSecret(encrypted)).toThrow('HAL_ENCRYPTION_KEY')
    })

    it('should throw error if decryption fails (wrong key)', () => {
      const encrypted = encryptSecret('test')
      process.env.HAL_ENCRYPTION_KEY = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
      expect(() => decryptSecret(encrypted)).toThrow('Decryption failed')
    })

    it('should throw error if encrypted value is empty', () => {
      expect(() => decryptSecret('')).toThrow('non-empty string')
    })
  })

  describe('isEncrypted', () => {
    it('should return true for encrypted values', () => {
      const encrypted = encryptSecret('test-secret')
      expect(isEncrypted(encrypted)).toBe(true)
    })

    it('should return false for plaintext values', () => {
      expect(isEncrypted('plain-secret')).toBe(false)
      expect(isEncrypted('ghp_1234567890')).toBe(false)
      expect(isEncrypted('sk-1234567890')).toBe(false)
    })

    it('should return false for invalid formats', () => {
      expect(isEncrypted('part1:part2')).toBe(false)
      expect(isEncrypted('part1:part2:part3:part4')).toBe(false)
      expect(isEncrypted('not:base64:format!')).toBe(false)
    })

    it('should return false for null/undefined', () => {
      expect(isEncrypted(null)).toBe(false)
      expect(isEncrypted(undefined)).toBe(false)
    })

    it('should return false for empty string', () => {
      expect(isEncrypted('')).toBe(false)
    })
  })

  describe('key derivation', () => {
    it('should accept 64 hex char key (32 bytes) directly', () => {
      const key = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
      process.env.HAL_ENCRYPTION_KEY = key
      const plaintext = 'test'
      const encrypted = encryptSecret(plaintext)
      expect(decryptSecret(encrypted)).toBe(plaintext)
    })

    it('should derive 32-byte key from shorter key using SHA-256', () => {
      process.env.HAL_ENCRYPTION_KEY = 'short-key'
      const plaintext = 'test'
      const encrypted = encryptSecret(plaintext)
      expect(decryptSecret(encrypted)).toBe(plaintext)
    })

    it('should derive 32-byte key from longer key using SHA-256', () => {
      process.env.HAL_ENCRYPTION_KEY = 'a'.repeat(100)
      const plaintext = 'test'
      const encrypted = encryptSecret(plaintext)
      expect(decryptSecret(encrypted)).toBe(plaintext)
    })
  })
})
