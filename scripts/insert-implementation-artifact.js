/**
 * Insert an Implementation artifact for a ticket (0082).
 * 
 * Usage: node scripts/insert-implementation-artifact.js <ticketId>
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

const ticketId = process.argv[2]?.trim()

if (!ticketId) {
  console.error('Usage: node scripts/insert-implementation-artifact.js <ticketId>')
  process.exit(1)
}

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_ANON_KEY in .env (or VITE_ variants)')
  console.error('Current env check:')
  console.error('  SUPABASE_URL:', process.env.SUPABASE_URL ? 'set' : 'not set')
  console.error('  VITE_SUPABASE_URL:', process.env.VITE_SUPABASE_URL ? 'set' : 'not set')
  console.error('  SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? 'set' : 'not set')
  console.error('  VITE_SUPABASE_ANON_KEY:', process.env.VITE_SUPABASE_ANON_KEY ? 'set' : 'not set')
  process.exit(1)
}

async function main() {
  const supabase = createClient(url, key)
  
  // Get ticket to retrieve pk and repo_full_name
  const { data: ticket, error: ticketError } = await supabase
    .from('tickets')
    .select('pk, repo_full_name, display_id, title')
    .or(`id.eq.${ticketId},display_id.eq.${ticketId},display_id.eq.HAL-${ticketId}`)
    .single()
  
  if (ticketError || !ticket) {
    console.error('Ticket not found:', ticketError?.message || 'No ticket found')
    process.exit(1)
  }
  
  // Try to find audit directory - try multiple patterns
  let auditDir = null
  const possibleDirs = [
    // Direct pattern: 0082-implementation
    path.join(repoRoot, 'docs', 'audit', `${ticketId}-implementation`),
    // From ticket filename if it exists
    ticket.filename ? (() => {
      const auditDirMatch = ticket.filename.match(/^(\d{4})-(.+)\.md$/)
      if (auditDirMatch) {
        return path.join(repoRoot, 'docs', 'audit', `${ticketId}-${auditDirMatch[2]}`)
      }
      return null
    })() : null,
    // From ticket title
    ticket.title ? (() => {
      const shortTitle = ticket.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50)
      return path.join(repoRoot, 'docs', 'audit', `${ticketId}-${shortTitle}`)
    })() : null,
  ].filter(Boolean)
  
  for (const dir of possibleDirs) {
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      auditDir = dir
      break
    }
  }
  
  // Read all audit files and create separate artifacts for each
  const auditFiles = [
    { name: 'plan.md', title: 'Plan', agentType: 'implementation' },
    { name: 'worklog.md', title: 'Worklog', agentType: 'implementation' },
    { name: 'changed-files.md', title: 'Changed Files', agentType: 'implementation' },
    { name: 'decisions.md', title: 'Decisions', agentType: 'implementation' },
    { name: 'verification.md', title: 'Verification', agentType: 'implementation' },
    { name: 'pm-review.md', title: 'PM Review', agentType: 'implementation' },
  ]
  
  if (!auditDir) {
    console.warn(`Audit directory not found. Tried: ${possibleDirs.join(', ')}`)
    process.exit(1)
  }
  
  console.log(`Found audit directory: ${auditDir}`)
  
  // Create/update artifacts for each audit file
  for (const file of auditFiles) {
    const filePath = path.join(auditDir, file.name)
    if (!fs.existsSync(filePath)) {
      console.log(`  Skipping ${file.name} (not found)`)
      continue
    }
    
    try {
      const content = fs.readFileSync(filePath, 'utf8')
      const artifactTitle = `${file.title} for ticket ${ticket.display_id || ticketId}`
      
      // Check if artifact already exists
      const { data: existing } = await supabase
        .from('agent_artifacts')
        .select('artifact_id')
        .eq('ticket_pk', ticket.pk)
        .eq('agent_type', file.agentType)
        .ilike('title', `%${file.title}%`)
        .maybeSingle()
      
      if (existing) {
        // Update existing artifact
        const { error: updateError } = await supabase
          .from('agent_artifacts')
          .update({
            title: artifactTitle,
            body_md: content,
          })
          .eq('artifact_id', existing.artifact_id)
        
        if (updateError) {
          console.error(`  Failed to update ${file.name}:`, updateError.message)
        } else {
          console.log(`  Updated ${file.title} artifact`)
        }
      } else {
        // Insert new artifact
        const { error: insertError } = await supabase.from('agent_artifacts').insert({
          ticket_pk: ticket.pk,
          repo_full_name: ticket.repo_full_name,
          agent_type: file.agentType,
          title: artifactTitle,
          body_md: content,
        })
        
        if (insertError) {
          console.error(`  Failed to insert ${file.name}:`, insertError.message)
        } else {
          console.log(`  Inserted ${file.title} artifact`)
        }
      }
    } catch (err) {
      console.error(`  Failed to process ${file.name}:`, err.message)
    }
  }
  
  console.log(`\nCompleted processing artifacts for ticket ${ticket.display_id || ticketId}`)
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
