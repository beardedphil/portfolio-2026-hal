#!/usr/bin/env node
/**
 * Cleanup duplicates by updating each artifact type once, which triggers the duplicate deletion logic.
 * Usage: node scripts/cleanup-via-update.js <ticketId1> [ticketId2] ...
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
  console.error('Usage: node scripts/cleanup-via-update.js <ticketId1> [ticketId2] ...')
  process.exit(1)
}

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
 * Cleanup artifacts for a single ticket by updating them
 */
async function cleanupTicket(ticketId) {
  console.log(`\n=== Cleaning up ticket ${ticketId} ===`)
  
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
      console.error(`  ❌ Error fetching artifacts: ${artifactsData.error}`)
      return { success: false, error: artifactsData.error }
    }
  } catch (err) {
    console.error(`  ❌ Error fetching artifacts: ${err.message}`)
    return { success: false, error: err.message }
  }

  const artifacts = artifactsData.artifacts || []
  console.log(`  Found ${artifacts.length} artifacts`)

  if (artifacts.length === 0) {
    console.log(`  ✅ No artifacts found`)
    return { success: true, cleaned: 0 }
  }

  // Extract display_id from artifact titles (prefer HAL- format)
  let displayId = ticketId
  const halTitleMatch = artifacts.find(a => a.title?.includes('HAL-'))?.title?.match(/ticket\s+(HAL-[0-9]+)/i)
  if (halTitleMatch) {
    displayId = halTitleMatch[1]
  } else {
    const titleMatch = artifacts.find(a => a.title)?.title?.match(/ticket\s+([A-Z0-9-]+)/i)
    if (titleMatch) {
      displayId = titleMatch[1]
    }
  }

  console.log(`  Using display_id: ${displayId}`)

  // Group artifacts by canonical type
  const byType = new Map()
  for (const artifact of artifacts) {
    const type = extractArtifactTypeFromTitle(artifact.title || '')
    if (!type) continue
    
    if (!byType.has(type)) {
      byType.set(type, [])
    }
    byType.get(type).push(artifact)
  }

  console.log(`  Found ${byType.size} artifact types`)

  let totalCleaned = 0

  // For each type with duplicates, update the best artifact once
  // This should trigger the duplicate deletion logic in the endpoint
  for (const [type, typeArtifacts] of byType.entries()) {
    if (typeArtifacts.length <= 1) {
      continue // No duplicates
    }

    console.log(`  🔍 Processing ${type}: ${typeArtifacts.length} artifacts`)

    // Find best artifact to keep (most recent with content)
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

    console.log(`    Keeping: "${keepArtifact.title}" (${keepArtifact.created_at})`)
    console.log(`    Updating to trigger cleanup of ${duplicatesCount} duplicate(s)...`)

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
        const cleaned = updateData.cleaned_up_duplicates || duplicatesCount
        console.log(`    ✅ Updated and cleaned up ${cleaned} duplicate(s)`)
      } else {
        console.log(`    ❌ Failed: ${updateData.error}`)
      }
    } catch (err) {
      console.log(`    ❌ Error: ${err.message}`)
    }
    
    // Small delay between types
    await new Promise(resolve => setTimeout(resolve, 500))
  }

  console.log(`  ✅ Cleanup complete: ${totalCleaned} duplicates should be cleaned`)
  return { success: true, cleaned: totalCleaned }
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
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  console.log(`\n=== Summary ===`)
  for (const result of results) {
    if (result.success) {
      console.log(`✅ ${result.ticketId}: ${result.cleaned || 0} duplicates cleaned`)
    } else {
      console.log(`❌ ${result.ticketId}: ${result.error}`)
    }
  }
  
  console.log(`\n⚠️  Note: Please verify the cleanup by running:`)
  console.log(`   node scripts/fetch-ticket-artifacts.js <ticketId>`)
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
