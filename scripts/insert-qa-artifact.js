/**
 * Insert a QA artifact for a ticket (0082).
 * 
 * Usage: node scripts/insert-qa-artifact.js <ticketId>
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
  console.error('Usage: node scripts/insert-qa-artifact.js <ticketId>')
  process.exit(1)
}

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_ANON_KEY in .env (or VITE_ variants)')
  process.exit(1)
}

async function main() {
  const supabase = createClient(url, key)
  
  // Get ticket to retrieve pk and repo_full_name
  const { data: ticket, error: ticketError } = await supabase
    .from('tickets')
    .select('pk, repo_full_name, display_id, title, filename')
    .or(`id.eq.${ticketId},display_id.eq.${ticketId},display_id.eq.HAL-${ticketId}`)
    .single()
  
  if (ticketError || !ticket) {
    console.error('Ticket not found:', ticketError?.message || 'No ticket found')
    process.exit(1)
  }
  
  // Try to find audit directory and read qa-report.md
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
  
  if (!auditDir) {
    console.warn(`Audit directory not found. Tried: ${possibleDirs.join(', ')}`)
    console.warn('Creating QA artifact with summary only.')
  }
  
  // Read qa-report.md if available
  let qaReportContent = ''
  if (auditDir) {
    const qaReportPath = path.join(auditDir, 'qa-report.md')
    if (fs.existsSync(qaReportPath)) {
      try {
        qaReportContent = fs.readFileSync(qaReportPath, 'utf8')
        console.log(`Found qa-report.md at: ${qaReportPath}`)
      } catch (err) {
        console.warn(`Failed to read qa-report.md:`, err.message)
      }
    } else {
      console.warn(`qa-report.md not found at: ${qaReportPath}`)
    }
  }
  
  if (!qaReportContent) {
    console.warn('No qa-report.md content found. Creating artifact with placeholder.')
    qaReportContent = `QA completed for ticket ${ticket.display_id || ticketId}.\n\nNo qa-report.md found in audit directory.`
  }
  
  const artifactTitle = `QA report for ticket ${ticket.display_id || ticketId}`
  
  // Check if artifact already exists
  const { data: existing } = await supabase
    .from('agent_artifacts')
    .select('artifact_id')
    .eq('ticket_pk', ticket.pk)
    .eq('agent_type', 'qa')
    .eq('title', artifactTitle)
    .maybeSingle()
  
  if (existing) {
    // Update existing artifact
    const { error: updateError } = await supabase
      .from('agent_artifacts')
      .update({
        title: artifactTitle,
        body_md: qaReportContent,
      })
      .eq('artifact_id', existing.artifact_id)
    
    if (updateError) {
      console.error('Failed to update artifact:', updateError.message)
      process.exit(1)
    }
    
    console.log(`Updated QA artifact for ticket ${ticket.display_id || ticketId}`)
  } else {
    // Insert new artifact
    const { error: insertError } = await supabase.from('agent_artifacts').insert({
      ticket_pk: ticket.pk,
      repo_full_name: ticket.repo_full_name,
      agent_type: 'qa',
      title: artifactTitle,
      body_md: qaReportContent,
    })
    
    if (insertError) {
      console.error('Failed to insert artifact:', insertError.message)
      process.exit(1)
    }
    
    console.log(`Inserted QA artifact for ticket ${ticket.display_id || ticketId}`)
  }
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
