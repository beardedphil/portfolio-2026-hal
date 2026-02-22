/**
 * Database operations for encrypted secrets.
 * Handles storing and retrieving encrypted OAuth tokens and Supabase keys.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { encryptSecret, decryptSecret, isEncrypted } from './encryption.js'

export type SecretType =
  | 'oauth_github_access_token'
  | 'oauth_github_refresh_token'
  | 'supabase_service_role_key'
  | 'supabase_anon_key'

export interface EncryptedSecretRecord {
  id: string
  created_at: string
  updated_at: string
  secret_type: SecretType
  encrypted_value: string
  identifier: string | null
  metadata: Record<string, unknown> | null
}

/**
 * Stores an encrypted secret in the database.
 * If a secret with the same type and identifier exists, it will be updated.
 *
 * @param supabase - Supabase client (must use service role key to bypass RLS)
 * @param secretType - Type of secret (e.g., 'oauth_github_access_token')
 * @param plaintext - The secret to encrypt and store
 * @param identifier - Optional identifier (e.g., session ID, project ID)
 * @param metadata - Optional metadata (e.g., token expiry, scope)
 * @returns The stored record
 * @throws Error if encryption fails or database operation fails
 */
export async function storeEncryptedSecret(
  supabase: SupabaseClient,
  secretType: SecretType,
  plaintext: string,
  identifier: string | null = null,
  metadata: Record<string, unknown> | null = null
): Promise<EncryptedSecretRecord> {
  if (!plaintext || typeof plaintext !== 'string') {
    throw new Error('Cannot store secret: plaintext must be a non-empty string')
  }

  try {
    const encryptedValue = encryptSecret(plaintext)

    // Try to update existing secret first (upsert pattern)
    const { data: existing, error: selectError } = await supabase
      .from('encrypted_secrets')
      .select('id')
      .eq('secret_type', secretType)
      .eq('identifier', identifier ?? null)
      .maybeSingle()

    if (selectError && selectError.code !== 'PGRST116') {
      // PGRST116 is "not found", which is fine
      throw new Error(`Failed to check existing secret: ${selectError.message}`)
    }

    if (existing) {
      // Update existing record
      const { data, error } = await supabase
        .from('encrypted_secrets')
        .update({
          encrypted_value: encryptedValue,
          metadata,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single()

      if (error) {
        throw new Error(`Failed to update encrypted secret: ${error.message}`)
      }

      return data as EncryptedSecretRecord
    } else {
      // Insert new record
      const { data, error } = await supabase
        .from('encrypted_secrets')
        .insert({
          secret_type: secretType,
          encrypted_value: encryptedValue,
          identifier,
          metadata,
        })
        .select()
        .single()

      if (error) {
        throw new Error(`Failed to insert encrypted secret: ${error.message}`)
      }

      return data as EncryptedSecretRecord
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('HAL_ENCRYPTION_KEY')) {
      throw err
    }
    throw new Error(`Failed to store encrypted secret: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/**
 * Retrieves and decrypts a secret from the database.
 *
 * @param supabase - Supabase client (must use service role key to bypass RLS)
 * @param secretType - Type of secret to retrieve
 * @param identifier - Optional identifier to filter by
 * @returns Decrypted plaintext secret, or null if not found
 * @throws Error if decryption fails
 */
export async function getEncryptedSecret(
  supabase: SupabaseClient,
  secretType: SecretType,
  identifier: string | null = null
): Promise<string | null> {
  try {
    let query = supabase.from('encrypted_secrets').select('encrypted_value').eq('secret_type', secretType)

    if (identifier !== null) {
      query = query.eq('identifier', identifier)
    } else {
      query = query.is('identifier', null)
    }

    const { data, error } = await query.maybeSingle()

    if (error && error.code !== 'PGRST116') {
      // PGRST116 is "not found", which is fine
      throw new Error(`Failed to retrieve encrypted secret: ${error.message}`)
    }

    if (!data || !data.encrypted_value) {
      return null
    }

    try {
      return decryptSecret(data.encrypted_value)
    } catch (decryptErr) {
      throw new Error(
        `Failed to decrypt secret: ${decryptErr instanceof Error ? decryptErr.message : String(decryptErr)}`
      )
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('HAL_ENCRYPTION_KEY')) {
      throw err
    }
    throw new Error(`Failed to get encrypted secret: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/**
 * Deletes an encrypted secret from the database.
 *
 * @param supabase - Supabase client (must use service role key to bypass RLS)
 * @param secretType - Type of secret to delete
 * @param identifier - Optional identifier to filter by
 * @returns true if deleted, false if not found
 */
export async function deleteEncryptedSecret(
  supabase: SupabaseClient,
  secretType: SecretType,
  identifier: string | null = null
): Promise<boolean> {
  try {
    let query = supabase.from('encrypted_secrets').delete().eq('secret_type', secretType)

    if (identifier !== null) {
      query = query.eq('identifier', identifier)
    } else {
      query = query.is('identifier', null)
    }

    const { error } = await query

    if (error) {
      throw new Error(`Failed to delete encrypted secret: ${error.message}`)
    }

    return true
  } catch (err) {
    throw new Error(`Failed to delete encrypted secret: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/**
 * Migrates a plaintext secret to encrypted format.
 * Checks if the secret is already encrypted; if not, encrypts and stores it.
 *
 * @param supabase - Supabase client (must use service role key to bypass RLS)
 * @param secretType - Type of secret
 * @param plaintext - The plaintext secret (may already be encrypted)
 * @param identifier - Optional identifier
 * @param metadata - Optional metadata
 * @returns true if migration was performed, false if already encrypted
 */
export async function migratePlaintextSecret(
  supabase: SupabaseClient,
  secretType: SecretType,
  plaintext: string,
  identifier: string | null = null,
  metadata: Record<string, unknown> | null = null
): Promise<boolean> {
  // Check if already encrypted
  if (isEncrypted(plaintext)) {
    // Already encrypted, just store it
    await storeEncryptedSecret(supabase, secretType, plaintext, identifier, metadata)
    return false
  }

  // Plaintext - encrypt and store
  await storeEncryptedSecret(supabase, secretType, plaintext, identifier, metadata)
  return true
}
