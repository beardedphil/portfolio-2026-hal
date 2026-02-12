#!/usr/bin/env node
/**
 * Cleanup duplicate artifacts via HAL API endpoint (which has Supabase access).
 * Usage: node scripts/cleanup-duplicates-direct.js <ticketId1> [ticketId2] ...
 */

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Get HAL API base URL
let baseUrl
try {
  const apiBaseUrlPath = join(__dirname, '..', '.hal', 'api-base-url')
  baseUrl = readFileSync(apiBaseUrlPath, 'utf8').trim()
} catch (err) {
  baseUrl = process.env.HAL_API_BASE_URL || 'https://portfolio-2026-hal.vercel.app'
}

const ticketIds = process.argv.slice(2)
if (ticketIds.length === 0) {
  console.error('Usage: node scripts/cleanup-duplicates-direct.js <ticketId1> [ticketId2] ...')
  process.exit(1)
}

// No direct Supabase client - we'll use HAL API

/**
 * Extract artifact type from title
 */
function extractArtifactTypeFromTitle(title) {
  const normalized = (title || '').toLowerCase().trim()
  
  if (normalized.startsWith('plan for ticket')) return 'plan'
  if (normalized.startsWith('worklog for ticket')) return 'worklog'
  if (normalized.startsWith('changed files for ticket')) return 'changed-files'
  if (normalized.startsWith('decisions for ticket')) return 'decisions'
  if (normalized.startsWith('verification for ticket')) return 'verification'
  if (normalized.startsWith('pm review for ticket')) return 'pm-review'
  if (normalized.startsWith('qa report for ticket')) return 'qa-report'
  
  return null
}

/**
 * Create canonical title
 */
function createCanonicalTitle(artifactType, displayId) {
  const titleMap = {
    'plan': `Plan for ticket ${displayId}`,
    'worklog': `Worklog for ticket ${displayId}`,
    'changed-files': `Changed Files for ticket ${displayId}`,
    'decisions': `Decisions for ticket ${displayId}`,
    'verification': `Verification for ticket ${displayId}`,
    'pm-review': `PM Review for ticket ${displayId}`,
    'qa-report': `QA report for ticket ${displayId}`,
  }
  
  return titleMap[artifactType] || `Artifact for ticket ${displayId}`
}

/**
 * Check if artifact has substantive content
 */
function hasSubstantiveContent(bodyMd) {
  if (!bodyMd || bodyMd.trim().length === 0) return false
  
  const withoutHeadings = bodyMd
    .replace(/^#{1,6}\s+.*$/gm, '')
    .replace(/^[-*+]\s+.*$/gm, '')
    .replace(/^\d+\.\s+.*$/gm, '')
    .trim()
  
  if (withoutHeadings.length === 0) return false
  if (withoutHeadings.length < 30) return false
  
  return true
}

/**
 * Cleanup artifacts for a single ticket via HAL API
 */
async function cleanupTicket(ticketId) {
  console.log(`\n=== Cleaning up ticket ${ticketId} ===`)
  
  try {
    const response = await fetch(`${baseUrl}/api/artifacts/cleanup-duplicates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketId }),
    })
    
    const result = await response.json()
    
    if (!result.success) {
      console.error(`  ❌ Error: ${result.error}`)
      return { success: false, error: result.error }
    }

    console.log(`  ✅ ${result.message || `Cleaned up ${result.deleted || 0} duplicate(s) and updated ${result.updated || 0} title(s)`}`)
    return { success: true, deleted: result.deleted || 0, updated: result.updated || 0 }
  } catch (err) {
    console.error(`  ❌ Error: ${err instanceof Error ? err.message : String(err)}`)
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Main function
 */
async function main() {
  console.log(`Cleaning up duplicate artifacts for ${ticketIds.length} ticket(s)...`)
  console.log(`Using HAL API: ${baseUrl}\n`)

  const results = []
  for (const ticketId of ticketIds) {
    const result = await cleanupTicket(ticketId)
    results.push({ ticketId, ...result })
    // Small delay between tickets
    await new Promise(resolve => setTimeout(resolve, 500))
  }

  console.log(`\n=== Summary ===`)
  for (const result of results) {
    if (result.success) {
      console.log(`✅ ${result.ticketId}: ${result.deleted || 0} deleted, ${result.updated || 0} titles updated`)
    } else {
      console.log(`❌ ${result.ticketId}: ${result.error}`)
    }
  }
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
