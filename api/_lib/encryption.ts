/**
 * Encryption utilities for secrets at rest.
 * Uses AES-256-GCM for authenticated encryption.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16 // 128 bits for GCM
const SALT_LENGTH = 32 // 256 bits
const TAG_LENGTH = 16 // 128 bits for GCM authentication tag
const KEY_LENGTH = 32 // 256 bits

/**
 * Derives an encryption key from HAL_ENCRYPTION_KEY using scrypt.
 * The encryption key is never stored; it's derived from the environment variable.
 */
function getEncryptionKey(): Buffer {
  const envKey = process.env.HAL_ENCRYPTION_KEY?.trim()
  if (!envKey || envKey.length < 32) {
    throw new Error(
      'HAL_ENCRYPTION_KEY is missing or too short (minimum 32 characters). ' +
        'Set HAL_ENCRYPTION_KEY in Vercel Environment Variables to enable secret encryption.'
    )
  }

  // Use a fixed salt derived from the env key itself (deterministic for same env key)
  // This ensures the same encryption key is derived each time
  const salt = scryptSync(envKey, 'hal-encryption-salt', SALT_LENGTH)
  return scryptSync(envKey, salt, KEY_LENGTH)
}

/**
 * Encrypts a plaintext secret.
 * Returns a base64-encoded string containing: salt + iv + encrypted_data + auth_tag
 *
 * @param plaintext - The secret to encrypt
 * @returns Base64-encoded encrypted string
 * @throws Error if HAL_ENCRYPTION_KEY is missing or invalid
 */
export function encryptSecret(plaintext: string): string {
  if (!plaintext || typeof plaintext !== 'string') {
    throw new Error('Cannot encrypt: plaintext must be a non-empty string')
  }

  try {
    const key = getEncryptionKey()
    const iv = randomBytes(IV_LENGTH)
    const cipher = createCipheriv(ALGORITHM, key, iv)

    let encrypted = cipher.update(plaintext, 'utf8')
    encrypted = Buffer.concat([encrypted, cipher.final()])
    const authTag = cipher.getAuthTag()

    // Combine: salt (for key derivation) + iv + encrypted_data + auth_tag
    // Note: We use a fixed salt derived from env key, so we don't need to store it
    // But we include IV and auth tag for security
    const combined = Buffer.concat([iv, encrypted, authTag])

    return combined.toString('base64')
  } catch (err) {
    if (err instanceof Error && err.message.includes('HAL_ENCRYPTION_KEY')) {
      throw err
    }
    throw new Error(`Encryption failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/**
 * Decrypts an encrypted secret.
 *
 * @param encryptedBase64 - Base64-encoded encrypted string (from encryptSecret)
 * @returns Decrypted plaintext
 * @throws Error if decryption fails (invalid key, corrupted data, etc.)
 */
export function decryptSecret(encryptedBase64: string): string {
  if (!encryptedBase64 || typeof encryptedBase64 !== 'string') {
    throw new Error('Cannot decrypt: encrypted data must be a non-empty string')
  }

  try {
    const key = getEncryptionKey()
    const combined = Buffer.from(encryptedBase64, 'base64')

    // Extract components
    if (combined.length < IV_LENGTH + TAG_LENGTH + 1) {
      throw new Error('Invalid encrypted data: too short')
    }

    const iv = combined.subarray(0, IV_LENGTH)
    const authTag = combined.subarray(combined.length - TAG_LENGTH)
    const encrypted = combined.subarray(IV_LENGTH, combined.length - TAG_LENGTH)

    const decipher = createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)

    let decrypted = decipher.update(encrypted)
    decrypted = Buffer.concat([decrypted, decipher.final()])

    return decrypted.toString('utf8')
  } catch (err) {
    if (err instanceof Error && err.message.includes('HAL_ENCRYPTION_KEY')) {
      throw err
    }
    // Don't leak details about decryption failures
    throw new Error('Decryption failed: invalid encryption key or corrupted data')
  }
}

/**
 * Checks if a string appears to be encrypted (base64 format with expected length).
 * This is a heuristic to detect if migration is needed.
 */
export function isEncrypted(possiblyEncrypted: string): boolean {
  if (!possiblyEncrypted || typeof possiblyEncrypted !== 'string') {
    return false
  }

  try {
    const decoded = Buffer.from(possiblyEncrypted, 'base64')
    // Encrypted data should be at least IV + some data + TAG
    return decoded.length >= IV_LENGTH + TAG_LENGTH + 1
  } catch {
    return false
  }
}
