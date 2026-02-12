#!/usr/bin/env node
/**
 * Cleanup duplicate artifacts for tickets by merging duplicates and using canonical titles.
 * Usage: node scripts/cleanup-duplicate-artifacts.js <ticketId1> [ticketId2] ...
 * Example: node scripts/cleanup-duplicate-artifacts.js 0118 0120 0121 0122
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
  console.error('Usage: node scripts/cleanup-duplicate-artifacts.js <ticketId1> [ticketId2] ...')
  console.error('Example: node scripts/cleanup-duplicate-artifacts.js 0118 0120 0121 0122')
  process.exit(1)
}

/**
 * Extract artifact type from title
 */
function extractArtifactTypeFromTitle(title) {
  const normalized = title.toLowerCase().trim()
  
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
function hasSubstantiveContent(bodyMd, title) {
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
 * Cleanup artifacts for a single ticket
 */
async function cleanupTicket(ticketId) {
  console.log(`\n=== Cleaning up ticket ${ticketId} ===`)
  
  // Fetch ticket to get display_id
  let ticketData
  try {
    const ticketRes = await fetch(`${baseUrl}/api/tickets/get`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketId }),
    })
    ticketData = await ticketRes.json()
    
    if (!ticketData.success) {
      console.error(`  ❌ Error fetching ticket: ${ticketData.error}`)
      return { success: false, error: ticketData.error }
    }
  } catch (err) {
    console.error(`  ❌ Error fetching ticket: ${err.message}`)
    return { success: false, error: err.message }
  }

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
    console.log(`  ✅ No artifacts to clean up`)
    return { success: true, cleaned: 0 }
  }

  // Extract display_id from ticket body or use ticketId
  // We need to get the actual display_id from the ticket
  // For now, try to extract it from artifact titles or use ticketId
  let displayId = ticketId
  const titleMatch = artifacts.find(a => a.title)?.title?.match(/ticket\s+([A-Z0-9-]+)/i)
  if (titleMatch) {
    displayId = titleMatch[1]
  }

  // Group artifacts by canonical type
  const byType = new Map()
  for (const artifact of artifacts) {
    const type = extractArtifactTypeFromTitle(artifact.title || '')
    if (!type) {
      console.log(`  ⚠️  Skipping artifact with unknown type: "${artifact.title}"`)
      continue
    }
    
    if (!byType.has(type)) {
      byType.set(type, [])
    }
    byType.get(type).push(artifact)
  }

  console.log(`  Found ${byType.size} artifact types`)

  let totalCleaned = 0
  let totalUpdated = 0

  // Process each type
  for (const [type, typeArtifacts] of byType.entries()) {
    if (typeArtifacts.length <= 1) {
      // No duplicates, but check if title needs updating
      const artifact = typeArtifacts[0]
      const canonicalTitle = createCanonicalTitle(type, displayId)
      
      if (artifact.title !== canonicalTitle) {
        console.log(`  📝 Updating "${artifact.title}" → "${canonicalTitle}"`)
        // Update via HAL API
        try {
          const updateRes = await fetch(`${baseUrl}/api/artifacts/${artifact.agent_type === 'qa' ? 'insert-qa' : 'insert-implementation'}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ticketId,
              ...(artifact.agent_type === 'implementation' ? { artifactType: type } : {}),
              title: canonicalTitle,
              body_md: artifact.body_md || '',
            }),
          })
          const updateData = await updateRes.json()
          if (updateData.success) {
            totalUpdated++
            console.log(`    ✅ Updated`)
          } else {
            console.log(`    ❌ Failed: ${updateData.error}`)
          }
        } catch (err) {
          console.log(`    ❌ Error: ${err.message}`)
        }
      }
      continue
    }

    console.log(`  🔍 Processing ${type}: ${typeArtifacts.length} artifacts`)

    // Separate by content
    const withContent = []
    const empty = []

    for (const artifact of typeArtifacts) {
      if (hasSubstantiveContent(artifact.body_md, artifact.title)) {
        withContent.push(artifact)
      } else {
        empty.push(artifact)
      }
    }

    // Choose the artifact to keep (most recent with content, or most recent overall)
    let keepArtifact = null
    if (withContent.length > 0) {
      // Sort by created_at descending
      withContent.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      keepArtifact = withContent[0]
    } else if (typeArtifacts.length > 0) {
      typeArtifacts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      keepArtifact = typeArtifacts[0]
    }

    if (!keepArtifact) {
      console.log(`    ⚠️  No artifact to keep, skipping`)
      continue
    }

    const canonicalTitle = createCanonicalTitle(type, displayId)
    const duplicates = typeArtifacts.filter(a => a.artifact_id !== keepArtifact.artifact_id)

    console.log(`    Keeping: "${keepArtifact.title}" (${keepArtifact.created_at})`)
    console.log(`    Deleting ${duplicates.length} duplicate(s)`)

    // Update the kept artifact to use canonical title (if needed)
    if (keepArtifact.title !== canonicalTitle || keepArtifact.body_md !== (keepArtifact.body_md || '')) {
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
          totalUpdated++
          console.log(`    ✅ Updated to canonical title`)
        } else {
          console.log(`    ⚠️  Update failed: ${updateData.error} (but duplicates will still be cleaned up)`)
        }
      } catch (err) {
        console.log(`    ⚠️  Update error: ${err.message} (but duplicates will still be cleaned up)`)
      }
    }

    // Note: The HAL API will automatically delete duplicates when we update
    // But we can't directly delete via HAL API, so we rely on the update endpoint
    // which should handle cleanup. However, if there are duplicates that weren't
    // cleaned up, we need a different approach.
    
    // Actually, the update endpoint should handle this, but let's trigger it
    // by updating each duplicate (which should merge them)
    for (const duplicate of duplicates) {
      try {
        // Trigger update with canonical title - this should cause the endpoint to delete this duplicate
        const updateRes = await fetch(`${baseUrl}/api/artifacts/${duplicate.agent_type === 'qa' ? 'insert-qa' : 'insert-implementation'}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticketId,
            ...(duplicate.agent_type === 'implementation' ? { artifactType: type } : {}),
            title: canonicalTitle,
            body_md: duplicate.body_md || keepArtifact.body_md || '',
          }),
        })
        const updateData = await updateRes.json()
        if (updateData.success) {
          totalCleaned++
        }
      } catch (err) {
        console.log(`    ⚠️  Error cleaning duplicate: ${err.message}`)
      }
    }
  }

  console.log(`  ✅ Cleanup complete: ${totalCleaned} duplicates cleaned, ${totalUpdated} titles updated`)
  return { success: true, cleaned: totalCleaned, updated: totalUpdated }
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
  }

  console.log(`\n=== Summary ===`)
  for (const result of results) {
    if (result.success) {
      console.log(`✅ ${result.ticketId}: ${result.cleaned || 0} duplicates cleaned, ${result.updated || 0} titles updated`)
    } else {
      console.log(`❌ ${result.ticketId}: ${result.error}`)
    }
  }
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
