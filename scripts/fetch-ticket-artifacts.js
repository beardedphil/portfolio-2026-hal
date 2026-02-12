#!/usr/bin/env node
/**
 * Fetch a ticket and all its artifacts via HAL API for debugging.
 * Usage: node scripts/fetch-ticket-artifacts.js <ticketId>
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

const ticketId = process.argv[2]
if (!ticketId) {
  console.error('Usage: node scripts/fetch-ticket-artifacts.js <ticketId>')
  console.error('Example: node scripts/fetch-ticket-artifacts.js 0121')
  process.exit(1)
}

async function main() {
  console.log(`Fetching ticket ${ticketId} and artifacts from ${baseUrl}...\n`)

  // Fetch ticket content
  try {
    const ticketRes = await fetch(`${baseUrl}/api/tickets/get`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketId }),
    })
    const ticketData = await ticketRes.json()
    
    if (!ticketData.success) {
      console.error('Error fetching ticket:', ticketData.error)
      process.exit(1)
    }

    console.log('=== TICKET ===')
    console.log(`Ticket ID: ${ticketId}`)
    console.log(`Body preview: ${(ticketData.body_md || '').substring(0, 100)}...\n`)
  } catch (err) {
    console.error('Error fetching ticket:', err.message)
  }

  // Fetch artifacts
  try {
    const artifactsRes = await fetch(`${baseUrl}/api/artifacts/get`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketId }),
    })
    const artifactsData = await artifactsRes.json()
    
    if (!artifactsData.success) {
      console.error('Error fetching artifacts:', artifactsData.error)
      process.exit(1)
    }

    const artifacts = artifactsData.artifacts || []
    console.log(`=== ARTIFACTS (${artifacts.length} total) ===\n`)

    if (artifacts.length === 0) {
      console.log('No artifacts found')
      return
    }

    // Group by title to see duplicates
    const byTitle = new Map()
    for (const artifact of artifacts) {
      const title = artifact.title || '(no title)'
      if (!byTitle.has(title)) {
        byTitle.set(title, [])
      }
      byTitle.get(title).push(artifact)
    }

    console.log(`Unique titles: ${byTitle.size}`)
    console.log(`Total artifacts: ${artifacts.length}\n`)

    // Show artifacts grouped by title
    for (const [title, titleArtifacts] of byTitle.entries()) {
      console.log(`--- "${title}" (${titleArtifacts.length} instance(s)) ---`)
      for (const artifact of titleArtifacts) {
        const bodyPreview = (artifact.body_md || '').substring(0, 80).replace(/\n/g, ' ')
        const isEmpty = !artifact.body_md || artifact.body_md.trim().length < 30
        console.log(`  [${artifact.artifact_id?.substring(0, 8) || 'N/A'}...] ${artifact.agent_type} | ${artifact.created_at} | ${isEmpty ? 'EMPTY' : 'HAS CONTENT'}`)
        if (bodyPreview) {
          console.log(`    ${bodyPreview}...`)
        }
      }
      console.log()
    }

    // Analyze by artifact type pattern
    console.log(`=== ANALYSIS BY ARTIFACT TYPE PATTERN ===\n`)
    const byType = new Map()
    for (const artifact of artifacts) {
      const title = artifact.title || ''
      let type = 'unknown'
      
      if (title.toLowerCase().includes('plan for ticket')) type = 'plan'
      else if (title.toLowerCase().includes('worklog for ticket')) type = 'worklog'
      else if (title.toLowerCase().includes('changed files for ticket')) type = 'changed-files'
      else if (title.toLowerCase().includes('decisions for ticket')) type = 'decisions'
      else if (title.toLowerCase().includes('verification for ticket')) type = 'verification'
      else if (title.toLowerCase().includes('pm review for ticket')) type = 'pm-review'
      else if (title.toLowerCase().includes('qa report for ticket')) type = 'qa-report'
      
      if (!byType.has(type)) {
        byType.set(type, [])
      }
      byType.get(type).push(artifact)
    }

    for (const [type, typeArtifacts] of byType.entries()) {
      console.log(`${type}: ${typeArtifacts.length} artifact(s)`)
      const titles = new Set(typeArtifacts.map(a => a.title))
      if (titles.size > 1) {
        console.log(`  ⚠️  Multiple title formats found:`)
        for (const title of titles) {
          const count = typeArtifacts.filter(a => a.title === title).length
          console.log(`    - "${title}" (${count})`)
        }
      } else if (titles.size === 1) {
        const title = Array.from(titles)[0]
        console.log(`  Title: "${title}"`)
      }
      console.log()
    }
  } catch (err) {
    console.error('Error fetching artifacts:', err.message)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
