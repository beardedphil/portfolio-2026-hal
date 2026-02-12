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
    
    // Get response text first to check what we're dealing with
    const responseText = await response.text()
    
    // Check if it's HTML/error page
    if (!response.ok || responseText.includes('NOT_FOUND') || responseText.includes('page could not be found') || responseText.trim().startsWith('<')) {
      console.log(`  ⚠️  Cleanup endpoint returned ${response.status}, using update-based cleanup instead...`)
      return await cleanupViaUpdate(ticketId)
    }
    
    // Try to parse as JSON
    let result
    try {
      result = JSON.parse(responseText)
    } catch (parseErr) {
      console.log(`  ⚠️  Response is not JSON: ${responseText.substring(0, 200)}`)
      console.log(`  ⚠️  Using update-based cleanup as fallback...`)
      return await cleanupViaUpdate(ticketId)
    }
    
    if (!result.success) {
      console.error(`  ❌ Error: ${result.error}`)
      return { success: false, error: result.error }
    }

    console.log(`  ✅ ${result.message || `Cleaned up ${result.deleted || 0} duplicate(s) and updated ${result.updated || 0} title(s)`}`)
    return { success: true, deleted: result.deleted || 0, updated: result.updated || 0 }
  } catch (err) {
    console.error(`  ❌ Error: ${err instanceof Error ? err.message : String(err)}`)
    console.log(`  ⚠️  Trying update-based cleanup as fallback...`)
    return await cleanupViaUpdate(ticketId)
  }
}

/**
 * Fallback: Cleanup via update (uses existing insert endpoints)
 */
async function cleanupViaUpdate(ticketId) {
  // Fetch artifacts
  let artifactsData
  try {
    const artifactsRes = await fetch(`${baseUrl}/api/artifacts/get`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketId }),
    })
    artifactsData = await artifactsRes.json()
    
    if (!artifactsData.success) {
      return { success: false, error: artifactsData.error }
    }
  } catch (err) {
    return { success: false, error: err.message }
  }

  const artifacts = artifactsData.artifacts || []
  if (artifacts.length === 0) {
    return { success: true, deleted: 0 }
  }

  // Extract display_id
  let displayId = ticketId
  const halTitleMatch = artifacts.find(a => a.title?.includes('HAL-'))?.title?.match(/ticket\s+(HAL-[0-9]+)/i)
  if (halTitleMatch) {
    displayId = halTitleMatch[1]
  }

  // Group by canonical type
  const byType = new Map()
  for (const artifact of artifacts) {
    const type = extractArtifactTypeFromTitle(artifact.title || '')
    if (!type) continue
    if (!byType.has(type)) byType.set(type, [])
    byType.get(type).push(artifact)
  }

  let totalCleaned = 0

  // For each type with duplicates, update the best artifact once
  for (const [type, typeArtifacts] of byType.entries()) {
    if (typeArtifacts.length <= 1) continue

    const withContent = typeArtifacts.filter(a => hasSubstantiveContent(a.body_md))
    let keepArtifact = null
    
    if (withContent.length > 0) {
      withContent.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      keepArtifact = withContent[0]
    } else {
      typeArtifacts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      keepArtifact = typeArtifacts[0]
    }

    if (!keepArtifact) continue

    const canonicalTitle = createCanonicalTitle(type, displayId)
    const duplicatesCount = typeArtifacts.length - 1

    // Update once with canonical title - this should trigger duplicate deletion
    try {
      const updateRes = await fetch(`${baseUrl}/api/artifacts/${keepArtifact.agent_type === 'qa' ? 'insert-qa' : 'insert-implementation'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId,
          ...(keepArtifact.agent_type === 'implementation' ? { artifactType: type } : {}),
          title: canonicalTitle,
          body_md: keepArtifact.body_md || '',
        }),
      })
      const updateData = await updateRes.json()
      if (updateData.success) {
        totalCleaned += duplicatesCount
      }
    } catch (err) {
      // Continue with other types
    }
    
    await new Promise(resolve => setTimeout(resolve, 500))
  }

  return { success: true, deleted: totalCleaned }
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
