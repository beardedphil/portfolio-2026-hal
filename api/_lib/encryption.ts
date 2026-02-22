import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto'

/**
 * Encryption key from environment variable.
 * Must be 32 bytes (256 bits) for AES-256-GCM.
 */
function getEncryptionKey(): Buffer {
  const key = process.env.HAL_ENCRYPTION_KEY?.trim()
  if (!key) {
    throw new Error(
      'HAL_ENCRYPTION_KEY environment variable is required for secret encryption. Set a 32-byte (64 hex chars) or longer key.'
    )
  }

  // If key is exactly 64 hex chars (32 bytes), use it directly
  if (/^[0-9a-fA-F]{64}$/.test(key)) {
    return Buffer.from(key, 'hex')
  }

  // Otherwise, derive a 32-byte key using SHA-256
  return createHash('sha256').update(key).digest()
}

/**
 * Encrypts a secret value using AES-256-GCM.
 * Returns a base64-encoded string with format: iv:authTag:encryptedData
 *
 * @param plaintext - The secret to encrypt
 * @returns Encrypted string (base64 encoded)
 * @throws Error if HAL_ENCRYPTION_KEY is missing or invalid
 */
export function encryptSecret(plaintext: string): string {
  if (!plaintext || typeof plaintext !== 'string') {
    throw new Error('Plaintext must be a non-empty string')
  }

  try {
    const key = getEncryptionKey()
    const iv = randomBytes(12) // 12 bytes (96 bits) for GCM
    const cipher = createCipheriv('aes-256-gcm', key, iv)

    let encrypted = cipher.update(plaintext, 'utf8')
    encrypted = Buffer.concat([encrypted, cipher.final()])
    const authTag = cipher.getAuthTag()

    // Format: iv:authTag:encryptedData (all base64)
    const result = `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`
    return result
  } catch (err) {
    if (err instanceof Error && err.message.includes('HAL_ENCRYPTION_KEY')) {
      throw err
    }
    throw new Error(`Encryption failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/**
 * Decrypts a secret value that was encrypted with encryptSecret.
 *
 * @param encrypted - The encrypted string (format: iv:authTag:encryptedData)
 * @returns Decrypted plaintext string
 * @throws Error if decryption fails or HAL_ENCRYPTION_KEY is missing/invalid
 */
export function decryptSecret(encrypted: string): string {
  if (!encrypted || typeof encrypted !== 'string') {
    throw new Error('Encrypted value must be a non-empty string')
  }

  try {
    const key = getEncryptionKey()
    const parts = encrypted.split(':')
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted format: expected iv:authTag:encryptedData')
    }

    const [ivBase64, authTagBase64, encryptedBase64] = parts
    const iv = Buffer.from(ivBase64, 'base64')
    const authTag = Buffer.from(authTagBase64, 'base64')
    const encryptedData = Buffer.from(encryptedBase64, 'base64')

    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(authTag)

    let decrypted = decipher.update(encryptedData)
    decrypted = Buffer.concat([decrypted, decipher.final()])

    return decrypted.toString('utf8')
  } catch (err) {
    if (err instanceof Error && err.message.includes('HAL_ENCRYPTION_KEY')) {
      throw err
    }
    throw new Error(`Decryption failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/**
 * Checks if a string appears to be an encrypted value (format: iv:authTag:encryptedData).
 * This is a heuristic check - it doesn't verify the encryption is valid.
 *
 * @param value - The value to check
 * @returns true if the value appears to be encrypted, false otherwise
 */
export function isEncrypted(value: string | null | undefined): boolean {
  if (!value || typeof value !== 'string') {
    return false
  }
  // Encrypted format: base64:base64:base64 (three parts separated by colons)
  const parts = value.split(':')
  if (parts.length !== 3) {
    return false
  }
  // Check if all parts look like base64 (heuristic)
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/
  return parts.every((part) => part.length > 0 && base64Regex.test(part))
}
