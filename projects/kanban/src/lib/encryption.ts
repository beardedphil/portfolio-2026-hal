/**
 * Client-side encryption utilities for secrets at rest (kanban app).
 * 
 * Uses server API endpoints to encrypt/decrypt secrets.
 * The server handles encryption with HAL_ENCRYPTION_KEY.
 */

/**
 * Encrypt a secret using the server API.
 * 
 * @param plaintext - The secret to encrypt
 * @returns Promise resolving to base64-encoded encrypted string
 */
export async function encryptSecret(plaintext: string): Promise<string> {
  if (!plaintext || plaintext.trim() === '') {
    throw new Error('Cannot encrypt empty plaintext')
  }

  const response = await fetch('/api/secrets/encrypt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plaintext }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Encryption failed' }))
    throw new Error(error.error || 'Encryption failed')
  }

  const result = await response.json()
  return result.encrypted
}

/**
 * Decrypt a secret using the server API.
 * 
 * @param encrypted - Base64-encoded encrypted string
 * @returns Promise resolving to decrypted plaintext
 */
export async function decryptSecret(encrypted: string): Promise<string> {
  if (!encrypted || encrypted.trim() === '') {
    throw new Error('Cannot decrypt empty ciphertext')
  }

  const response = await fetch('/api/secrets/decrypt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ encrypted }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Decryption failed' }))
    throw new Error(error.error || 'Decryption failed')
  }

  const result = await response.json()
  return result.plaintext
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
    const decoded = atob(value)
    // Minimum size check (28 bytes = IV 12 + tag 16)
    return decoded.length >= 28
  } catch {
    return false
  }
}
