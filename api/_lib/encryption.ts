/**
 * Encryption utilities for secrets at rest.
 * 
 * Uses AES-256-GCM for authenticated encryption.
 * 
 * Requirements:
 * - HAL_ENCRYPTION_KEY must be set (32 bytes for AES-256, base64 or hex encoded)
 * - IV is generated randomly for each encryption (12 bytes for GCM)
 * - Authentication tag is included in the encrypted output
 */

import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // 96 bits for GCM
const TAG_LENGTH = 16 // 128 bits for authentication tag
const KEY_LENGTH = 32 // 256 bits

/**
 * Get the encryption key from environment variable.
 * Supports base64 or hex encoded keys.
 * 
 * @throws Error if HAL_ENCRYPTION_KEY is missing or invalid
 */
function getEncryptionKey(): Buffer {
  const keyEnv = process.env.HAL_ENCRYPTION_KEY?.trim()
  if (!keyEnv) {
    throw new Error(
      'HAL_ENCRYPTION_KEY is not configured. Set HAL_ENCRYPTION_KEY (32 bytes, base64 or hex encoded) in server environment variables.'
    )
  }

  let key: Buffer
  try {
    // Try base64 first
    key = Buffer.from(keyEnv, 'base64')
    if (key.length !== KEY_LENGTH) {
      // Try hex if base64 doesn't give us 32 bytes
      key = Buffer.from(keyEnv, 'hex')
      if (key.length !== KEY_LENGTH) {
        throw new Error(`HAL_ENCRYPTION_KEY must be exactly 32 bytes (got ${key.length} bytes)`)
      }
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes('must be exactly')) {
      throw e
    }
    throw new Error(
      `HAL_ENCRYPTION_KEY is invalid. Provide a 32-byte key encoded as base64 or hex.`
    )
  }

  return key
}

/**
 * Encrypt a plaintext string.
 * 
 * Output format: base64(iv + tag + ciphertext)
 * 
 * @param plaintext - The secret to encrypt
 * @returns Base64-encoded string containing IV, auth tag, and ciphertext
 * @throws Error if HAL_ENCRYPTION_KEY is missing or invalid
 */
export function encryptSecret(plaintext: string): string {
  if (!plaintext || plaintext.trim() === '') {
    throw new Error('Cannot encrypt empty plaintext')
  }

  const key = getEncryptionKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  // Encrypt
  let ciphertext = cipher.update(plaintext, 'utf8')
  ciphertext = Buffer.concat([ciphertext, cipher.final()])

  // Get authentication tag
  const tag = cipher.getAuthTag()

  // Combine: IV (12 bytes) + tag (16 bytes) + ciphertext
  const encrypted = Buffer.concat([iv, tag, ciphertext])

  // Return as base64
  return encrypted.toString('base64')
}

/**
 * Decrypt an encrypted string.
 * 
 * Input format: base64(iv + tag + ciphertext)
 * 
 * @param encrypted - Base64-encoded string containing IV, auth tag, and ciphertext
 * @returns The decrypted plaintext
 * @throws Error if decryption fails (invalid key, tampered data, or missing HAL_ENCRYPTION_KEY)
 */
export function decryptSecret(encrypted: string): string {
  if (!encrypted || encrypted.trim() === '') {
    throw new Error('Cannot decrypt empty ciphertext')
  }

  const key = getEncryptionKey()

  let encryptedBuffer: Buffer
  try {
    encryptedBuffer = Buffer.from(encrypted, 'base64')
  } catch (e) {
    throw new Error('Invalid encrypted data format (not base64)')
  }

  // Minimum size: IV (12) + tag (16) = 28 bytes
  if (encryptedBuffer.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error('Encrypted data is too short (missing IV or tag)')
  }

  // Extract components
  const iv = encryptedBuffer.subarray(0, IV_LENGTH)
  const tag = encryptedBuffer.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
  const ciphertext = encryptedBuffer.subarray(IV_LENGTH + TAG_LENGTH)

  // Decrypt
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  try {
    let plaintext = decipher.update(ciphertext, undefined, 'utf8')
    plaintext += decipher.final('utf8')
    return plaintext
  } catch (e) {
    // Authentication tag verification failed or other decryption error
    throw new Error('Decryption failed: invalid key or tampered data')
  }
}

/**
 * Check if a string appears to be encrypted (base64 format with minimum length).
 * This is a heuristic and may have false positives/negatives.
 */
export function isEncrypted(value: string): boolean {
  if (!value || value.trim() === '') return false
  
  // Encrypted values are base64 and at least 28 bytes (IV + tag minimum)
  // Base64 encoding: 28 bytes = ~38 characters
  if (value.length < 38) return false
  
  // Check if it's valid base64
  try {
    const decoded = Buffer.from(value, 'base64')
    // Minimum size check
    return decoded.length >= IV_LENGTH + TAG_LENGTH
  } catch {
    return false
  }
}
