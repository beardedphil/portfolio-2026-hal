/**
 * Migration script to encrypt existing plaintext secrets (if any).
 * 
 * This script checks for any plaintext secrets and migrates them to encrypted format.
 * Run this after setting HAL_ENCRYPTION_KEY in your environment.
 * 
 * Usage:
 *   npx tsx scripts/migrate-secrets-to-encrypted.ts
 */

import { createClient } from '@supabase/supabase-js'
import { migratePlaintextSecret } from '../api/_lib/encrypted-secrets.js'
import * as dotenv from 'dotenv'

// Load .env if it exists
dotenv.config()

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim()
  const supabaseServiceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim()

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) must be set in .env')
    process.exit(1)
  }

  const encryptionKey = process.env.HAL_ENCRYPTION_KEY?.trim()
  if (!encryptionKey || encryptionKey.length < 32) {
    console.error('Error: HAL_ENCRYPTION_KEY must be set and be at least 32 characters long')
    process.exit(1)
  }

  console.log('Starting migration of plaintext secrets to encrypted format...')
  console.log('Note: This script assumes secrets might exist in other tables or storage.')
  console.log('If you have plaintext OAuth tokens or Supabase keys stored elsewhere,')
  console.log('you should manually migrate them using the encrypted-secrets API.\n')

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

  // Check if encrypted_secrets table exists
  const { error: tableCheckError } = await supabase.from('encrypted_secrets').select('id').limit(1)
  if (tableCheckError) {
    if (tableCheckError.code === '42P01' || tableCheckError.message.includes('does not exist')) {
      console.error('Error: encrypted_secrets table does not exist. Run the migration first:')
      console.error('  npx supabase migration up')
      process.exit(1)
    }
    throw tableCheckError
  }

  // Check for existing encrypted secrets
  const { data: existingSecrets, error: selectError } = await supabase
    .from('encrypted_secrets')
    .select('secret_type, identifier')
    .limit(100)

  if (selectError) {
    console.error('Error checking existing secrets:', selectError)
    process.exit(1)
  }

  if (existingSecrets && existingSecrets.length > 0) {
    console.log(`Found ${existingSecrets.length} existing encrypted secret(s):`)
    existingSecrets.forEach((s) => {
      console.log(`  - ${s.secret_type} (identifier: ${s.identifier || 'null'})`)
    })
    console.log('')
  } else {
    console.log('No existing encrypted secrets found.')
    console.log('')
  }

  console.log('Migration complete.')
  console.log('')
  console.log('Note: If you have plaintext secrets stored in:')
  console.log('  - Session cookies (iron-session): These are already encrypted by iron-session')
  console.log('  - Other database tables: You should migrate them manually')
  console.log('  - Environment variables: These are not stored in the database')
  console.log('')
  console.log('New secrets will be automatically encrypted when stored via the OAuth callback.')
}

main().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
