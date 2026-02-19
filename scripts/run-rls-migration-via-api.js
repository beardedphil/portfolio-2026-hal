#!/usr/bin/env node

/**
 * Script to run the RLS enforcement migration via HAL's API
 */

import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Read API base URL
const apiBaseUrlFile = join(__dirname, '..', '.hal', 'api-base-url')
let apiBaseUrl = 'https://portfolio-2026-hal.vercel.app'

if (fs.existsSync(apiBaseUrlFile)) {
  apiBaseUrl = fs.readFileSync(apiBaseUrlFile, 'utf-8').trim()
}

// Read migration SQL file
const migrationFile = join(__dirname, '..', 'supabase', 'migrations', '20260219000000_enforce_rls_tickets_kanban.sql')
let sql = ''

try {
  sql = fs.readFileSync(migrationFile, 'utf-8')
} catch (err) {
  console.error(`❌ Error reading migration file: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
}

async function runMigration() {
  console.log('Running RLS enforcement migration via HAL API...')
  console.log(`API Base URL: ${apiBaseUrl}`)
  console.log('')

  try {
    const response = await fetch(`${apiBaseUrl}/api/migrations/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql }),
    })

    if (!response.ok) {
      const text = await response.text()
      console.error(`❌ API returned status ${response.status}: ${text}`)
      process.exit(1)
    }

    const result = await response.json()

    if (result.success) {
      console.log('✅ Migration request received!')
      console.log('')
      console.log('📋 Instructions:')
      if (result.instructions) {
        result.instructions.forEach((instruction) => console.log(`   ${instruction}`))
      }
      console.log('')
      console.log('📄 SQL to execute:')
      console.log('---')
      console.log(result.sql)
      console.log('---')
    } else {
      console.error('❌ Migration failed:')
      console.error(`   Error: ${result.error || 'Unknown error'}`)
      process.exit(1)
    }

    return result
  } catch (err) {
    console.error('❌ Error calling migration API:')
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
}

runMigration()
