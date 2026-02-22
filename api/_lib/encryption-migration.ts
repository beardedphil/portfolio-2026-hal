/**
 * Migration utilities for encrypting existing plaintext secrets.
 * 
 * This module provides helpers to migrate plaintext secrets to encrypted format.
 * Currently, OAuth tokens are stored in sessions (iron-session cookies), which
 * are automatically encrypted/decrypted transparently via getSession().
 * 
 * If Supabase service keys or other secrets are stored in the database in the future,
 * use these utilities to migrate them.
 */

import { encryptSecret, decryptSecret, isEncrypted } from './encryption.js'

/**
 * Migrates a plaintext secret to encrypted format.
 * If the value is already encrypted, returns it unchanged.
 * 
 * @param plaintext - The secret value (may be plaintext or already encrypted)
 * @returns Encrypted secret (or original if already encrypted)
 * @throws Error if encryption fails
 */
export function migrateSecretToEncrypted(plaintext: string | null | undefined): string | null {
  if (!plaintext) {
    return null
  }

  // If already encrypted, return as-is
  if (isEncrypted(plaintext)) {
    return plaintext
  }

  // Encrypt plaintext
  return encryptSecret(plaintext)
}

/**
 * Reads a secret value, decrypting if necessary.
 * Handles both plaintext (legacy) and encrypted (new) formats.
 * 
 * @param value - The secret value (may be plaintext or encrypted)
 * @returns Decrypted plaintext secret
 * @throws Error if decryption fails
 */
export function readSecret(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }

  // If encrypted, decrypt it
  if (isEncrypted(value)) {
    return decryptSecret(value)
  }

  // Otherwise, assume it's plaintext (legacy format)
  return value
}

/**
 * Batch migration helper for database records.
 * Example usage:
 * 
 * ```typescript
 * const records = await supabase.from('secrets_table').select('id, oauth_token, supabase_key')
 * for (const record of records.data || []) {
 *   const updates: Record<string, string | null> = {}
 *   if (record.oauth_token && !isEncrypted(record.oauth_token)) {
 *     updates.oauth_token = migrateSecretToEncrypted(record.oauth_token)
 *   }
 *   if (record.supabase_key && !isEncrypted(record.supabase_key)) {
 *     updates.supabase_key = migrateSecretToEncrypted(record.supabase_key)
 *   }
 *   if (Object.keys(updates).length > 0) {
 *     await supabase.from('secrets_table').update(updates).eq('id', record.id)
 *   }
 * }
 * ```
 */
export { isEncrypted, encryptSecret, decryptSecret }
