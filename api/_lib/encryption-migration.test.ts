import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { migrateSecretToEncrypted, readSecret } from './encryption-migration.js'
import * as encryption from './encryption.js'

vi.mock('./encryption.js', () => ({
  encryptSecret: vi.fn(),
  decryptSecret: vi.fn(),
  isEncrypted: vi.fn(),
}))

describe('migrateSecretToEncrypted', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null for null input', () => {
    expect(migrateSecretToEncrypted(null)).toBeNull()
  })

  it('returns null for undefined input', () => {
    expect(migrateSecretToEncrypted(undefined)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(migrateSecretToEncrypted('')).toBeNull()
  })

  it('returns encrypted value when already encrypted', () => {
    const encrypted = 'encrypted:value'
    vi.mocked(encryption.isEncrypted).mockReturnValue(true)
    
    const result = migrateSecretToEncrypted(encrypted)
    
    expect(result).toBe(encrypted)
    expect(encryption.encryptSecret).not.toHaveBeenCalled()
  })

  it('encrypts plaintext value', () => {
    const plaintext = 'plaintext-secret'
    const encrypted = 'encrypted:value'
    vi.mocked(encryption.isEncrypted).mockReturnValue(false)
    vi.mocked(encryption.encryptSecret).mockReturnValue(encrypted)
    
    const result = migrateSecretToEncrypted(plaintext)
    
    expect(result).toBe(encrypted)
    expect(encryption.encryptSecret).toHaveBeenCalledWith(plaintext)
  })

  it('throws error when encryption fails', () => {
    const plaintext = 'plaintext-secret'
    vi.mocked(encryption.isEncrypted).mockReturnValue(false)
    vi.mocked(encryption.encryptSecret).mockImplementation(() => {
      throw new Error('Encryption failed')
    })
    
    expect(() => migrateSecretToEncrypted(plaintext)).toThrow('Encryption failed')
  })
})

describe('readSecret', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null for null input', () => {
    expect(readSecret(null)).toBeNull()
  })

  it('returns null for undefined input', () => {
    expect(readSecret(undefined)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(readSecret('')).toBeNull()
  })

  it('decrypts encrypted value', () => {
    const encrypted = 'encrypted:value'
    const decrypted = 'decrypted-secret'
    vi.mocked(encryption.isEncrypted).mockReturnValue(true)
    vi.mocked(encryption.decryptSecret).mockReturnValue(decrypted)
    
    const result = readSecret(encrypted)
    
    expect(result).toBe(decrypted)
    expect(encryption.decryptSecret).toHaveBeenCalledWith(encrypted)
  })

  it('returns plaintext value when not encrypted', () => {
    const plaintext = 'plaintext-secret'
    vi.mocked(encryption.isEncrypted).mockReturnValue(false)
    
    const result = readSecret(plaintext)
    
    expect(result).toBe(plaintext)
    expect(encryption.decryptSecret).not.toHaveBeenCalled()
  })

  it('throws error when decryption fails', () => {
    const encrypted = 'encrypted:value'
    vi.mocked(encryption.isEncrypted).mockReturnValue(true)
    vi.mocked(encryption.decryptSecret).mockImplementation(() => {
      throw new Error('Decryption failed')
    })
    
    expect(() => readSecret(encrypted)).toThrow('Decryption failed')
  })
})
