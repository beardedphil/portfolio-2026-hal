/**
 * Migrate all audit files from docs/audit/ to Supabase agent_artifacts table (0082).
 * 
 * This script:
 * - Scans all audit folders in docs/audit/
 * - Reads all audit files (plan.md, worklog.md, changed-files.md, decisions.md, verification.md, pm-review.md, qa-report.md)
 * - Finds corresponding tickets in Supabase
 * - Creates artifacts in Supabase for each file
 * 
 * Usage: node scripts/migrate-audit-files-to-supabase.js [--dry-run]
 * 
 * Requires .env with SUPABASE_URL and SUPABASE_ANON_KEY.
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// Try multiple .env file locations
dotenv.config({ path: '.env' })
dotenv.config({ path: '.env.local' })

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const auditRoot = path.join(repoRoot, 'docs', 'audit')

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_ANON_KEY in .env (or VITE_ variants)')
  process.exit(1)
}

const isDryRun = process.argv.includes('--dry-run')

// Map of audit file names to agent types and titles
const auditFileMap: Record<string, { agentType: 'implementation' | 'qa' | 'human-in-the-loop' | 'other'; titlePrefix: string }> = {
  'plan.md': { agentType: 'implementation', titlePrefix: 'Plan' },
  'worklog.md': { agentType: 'implementation', titlePrefix: 'Worklog' },
  'changed-files.md': { agentType: 'implementation', titlePrefix: 'Changed Files' },
  'decisions.md': { agentType: 'implementation', titlePrefix: 'Decisions' },
  'verification.md': { agentType: 'implementation', titlePrefix: 'Verification' },
  'pm-review.md': { agentType: 'implementation', titlePrefix: 'PM Review' },
  'qa-report.md': { agentType: 'qa', titlePrefix: 'QA report' },
}

async function main() {
  const supabase = createClient(url, key)
  
  if (!fs.existsSync(auditRoot)) {
    console.error(`Audit directory not found: ${auditRoot}`)
    process.exit(1)
  }
  
  // Get all audit folders
  const auditFolders = fs.readdirSync(auditRoot, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name)
  
  console.log(`Found ${auditFolders.length} audit folders`)
  
  let totalArtifacts = 0
  let totalCreated = 0
  let totalUpdated = 0
  let totalSkipped = 0
  let totalErrors = 0
  
  for (const folderName of auditFolders) {
    // Extract ticket ID from folder name (e.g., "0082-implementation" -> "0082")
    const match = folderName.match(/^(\d{4})-/)
    if (!match) {
      console.warn(`  Skipping folder (invalid format): ${folderName}`)
      continue
    }
    
    const ticketId = match[1]
    const folderPath = path.join(auditRoot, folderName)
    
    console.log(`\nProcessing ${folderName} (ticket ${ticketId})...`)
    
    // Find ticket in Supabase
    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .select('pk, repo_full_name, display_id')
      .or(`id.eq.${ticketId},display_id.eq.${ticketId},display_id.eq.HAL-${ticketId}`)
      .maybeSingle()
    
    if (ticketError) {
      console.error(`  Error fetching ticket: ${ticketError.message}`)
      totalErrors++
      continue
    }
    
    if (!ticket) {
      console.warn(`  Ticket ${ticketId} not found in Supabase, skipping`)
      totalSkipped++
      continue
    }
    
    const displayId = ticket.display_id || ticketId
    
    // Process each audit file
    for (const [fileName, config] of Object.entries(auditFileMap)) {
      const filePath = path.join(folderPath, fileName)
      
      if (!fs.existsSync(filePath)) {
        continue // File doesn't exist, skip
      }
      
      totalArtifacts++
      
      try {
        const content = fs.readFileSync(filePath, 'utf8')
        const artifactTitle = `${config.titlePrefix} for ticket ${displayId}`
        
        if (isDryRun) {
          console.log(`  [DRY RUN] Would create: ${artifactTitle} (${fileName})`)
          totalCreated++
          continue
        }
        
        // Check if artifact already exists
        const { data: existing } = await supabase
          .from('agent_artifacts')
          .select('artifact_id')
          .eq('ticket_pk', ticket.pk)
          .eq('agent_type', config.agentType)
          .eq('title', artifactTitle)
          .maybeSingle()
        
        if (existing) {
          // Update existing artifact
          const { error: updateError } = await supabase
            .from('agent_artifacts')
            .update({
              body_md: content,
            })
            .eq('artifact_id', existing.artifact_id)
          
          if (updateError) {
            console.error(`  Error updating ${fileName}: ${updateError.message}`)
            totalErrors++
          } else {
            console.log(`  Updated: ${artifactTitle}`)
            totalUpdated++
          }
        } else {
          // Insert new artifact
          const { error: insertError } = await supabase.from('agent_artifacts').insert({
            ticket_pk: ticket.pk,
            repo_full_name: ticket.repo_full_name,
            agent_type: config.agentType,
            title: artifactTitle,
            body_md: content,
          })
          
          if (insertError) {
            console.error(`  Error inserting ${fileName}: ${insertError.message}`)
            totalErrors++
          } else {
            console.log(`  Created: ${artifactTitle}`)
            totalCreated++
          }
        }
      } catch (err) {
        console.error(`  Error processing ${fileName}:`, err instanceof Error ? err.message : String(err))
        totalErrors++
      }
    }
  }
  
  console.log(`\n=== Migration Summary ===`)
  console.log(`Total artifacts processed: ${totalArtifacts}`)
  console.log(`Created: ${totalCreated}`)
  console.log(`Updated: ${totalUpdated}`)
  console.log(`Skipped (ticket not found): ${totalSkipped}`)
  console.log(`Errors: ${totalErrors}`)
  
  if (isDryRun) {
    console.log(`\nThis was a dry run. Run without --dry-run to actually migrate.`)
  } else {
    console.log(`\nMigration complete!`)
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
