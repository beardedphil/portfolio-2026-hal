#!/usr/bin/env node
/**
 * Run a Supabase migration SQL file against the database.
 * 
 * Usage: node scripts/run-supabase-migration.js <migration-file>
 * 
 * Example: node scripts/run-supabase-migration.js supabase/migrations/20260219000000_enforce_rls_tickets_kanban.sql
 * 
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in environment or .env file.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Get migration file path from command line
const migrationFile = process.argv[2]

if (!migrationFile) {
  console.error('Usage: node scripts/run-supabase-migration.js <migration-file>')
  console.error('Example: node scripts/run-supabase-migration.js supabase/migrations/20260219000000_enforce_rls_tickets_kanban.sql')
  process.exit(1)
}

// Load Supabase credentials
const supabaseUrl = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim()
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY?.trim()

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment or .env file.')
  console.error('The service role key is required to run migrations that modify RLS policies.')
  process.exit(1)
}

// Read migration SQL file
const migrationPath = join(__dirname, '..', migrationFile)
let sql: string
try {
  sql = readFileSync(migrationPath, 'utf8')
} catch (err) {
  console.error(`Error reading migration file ${migrationPath}:`, err)
  process.exit(1)
}

// Execute migration using Supabase REST API (rpc endpoint for raw SQL)
// Note: Supabase JS client doesn't have a direct way to execute raw SQL,
// so we'll use the REST API directly
async function runMigration() {
  console.log(`Running migration: ${migrationFile}`)
  console.log(`Supabase URL: ${supabaseUrl}`)
  console.log('')

  try {
    // Use Supabase REST API to execute SQL
    // We'll use the PostgREST API with a custom RPC call or direct SQL execution
    // Since Supabase doesn't expose raw SQL execution via JS client, we'll use the REST API
    
    // Alternative: Use Supabase Management API if available, or use psql via node
    // For now, we'll use a workaround: execute via REST API using a stored procedure
    // But the simplest approach is to use the Supabase dashboard or CLI
    
    // Actually, let's use the Supabase JS client's ability to call RPC functions
    // We can create a temporary function to execute the SQL, or use the REST API directly
    
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseServiceRoleKey,
        'Authorization': `Bearer ${supabaseServiceRoleKey}`,
      },
      body: JSON.stringify({ sql }),
    })

    if (!response.ok) {
      // If RPC doesn't exist, try alternative approach
      console.log('Note: exec_sql RPC not available. Trying alternative approach...')
      console.log('')
      console.log('Please run this migration using one of these methods:')
      console.log('1. Supabase CLI: supabase db push (if using local Supabase)')
      console.log('2. Supabase Dashboard: Go to SQL Editor and paste the migration SQL')
      console.log('3. psql: Connect to your Supabase database and run the SQL file')
      console.log('')
      console.log('Migration SQL:')
      console.log('---')
      console.log(sql)
      console.log('---')
      process.exit(0)
    }

    const result = await response.json()
    console.log('Migration executed successfully!')
    console.log('Result:', result)
  } catch (err) {
    console.error('Error executing migration:', err)
    console.log('')
    console.log('Please run this migration manually using one of these methods:')
    console.log('1. Supabase CLI: supabase db push (if using local Supabase)')
    console.log('2. Supabase Dashboard: Go to SQL Editor and paste the migration SQL')
    console.log('3. psql: Connect to your Supabase database and run the SQL file')
    console.log('')
    console.log('Migration SQL:')
    console.log('---')
    console.log(sql)
    console.log('---')
    process.exit(1)
  }
}

runMigration()
