#!/usr/bin/env node

/**
 * Script to run the process docs migration via HAL's API
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

const repoFullName = 'beardedphil/portfolio-2026-hal'

async function runMigration() {
  console.log('Running process docs migration via HAL API...')
  console.log(`API Base URL: ${apiBaseUrl}`)
  console.log(`Repo: ${repoFullName}`)
  console.log('')

  try {
    const response = await fetch(`${apiBaseUrl}/api/instructions/migrate-process-docs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        repoFullName,
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      console.error(`❌ API returned status ${response.status}: ${text}`)
      process.exit(1)
    }

    const result = await response.json()

    if (result.success) {
      console.log('✅ Migration successful!')
      console.log(`   Migrated: ${result.migrated} files`)
      console.log(`   Failed: ${result.failed || 0} files`)
      console.log(`   Total: ${result.total} files`)
      if (result.migrationMapping) {
        console.log(`   Migration mapping stored at topic: ${result.migrationMapping.topicId}`)
      }
      if (result.errors && result.errors.length > 0) {
        console.log('   Warnings:')
        result.errors.forEach((err) => console.log(`     - ${err}`))
      }
    } else {
      console.error('❌ Migration failed:')
      console.error(`   Error: ${result.error || 'Unknown error'}`)
      if (result.errors && result.errors.length > 0) {
        console.error('   Errors:')
        result.errors.forEach((err) => console.error(`     - ${err}`))
      }
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
