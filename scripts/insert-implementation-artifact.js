/**
 * Insert an Implementation artifact for a ticket (0082).
 * 
 * Usage: node scripts/insert-implementation-artifact.js <ticketId>
 * 
 * Requires .env with SUPABASE_URL and SUPABASE_ANON_KEY.
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

config()

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
  console.error('Set SUPABASE_URL and SUPABASE_ANON_KEY in .env')
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
  
  // Try to read worklog if available
  const ticketFilename = ticket.title ? `${ticketId}-${ticket.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50)}.md` : `${ticketId}-implementation.md`
  const auditDirMatch = ticketFilename.match(/^(\d{4})-(.+)\.md$/)
  const shortTitle = auditDirMatch ? auditDirMatch[2] : 'implementation'
  const auditDir = path.join(repoRoot, 'docs', 'audit', `${ticketId}-${shortTitle}`)
  
  let artifactBody = `Implementation completed for ticket ${ticket.display_id || ticketId}.\n\n`
  
  // Try to append worklog if available
  const worklogPath = path.join(auditDir, 'worklog.md')
  if (fs.existsSync(worklogPath)) {
    try {
      const worklog = fs.readFileSync(worklogPath, 'utf8')
      artifactBody += `## Worklog\n\n${worklog}`
    } catch {
      // Ignore if worklog can't be read
    }
  }
  
  // Insert artifact
  const { error: insertError } = await supabase.from('agent_artifacts').insert({
    ticket_pk: ticket.pk,
    repo_full_name: ticket.repo_full_name,
    agent_type: 'implementation',
    title: `Implementation report for ticket ${ticket.display_id || ticketId}`,
    body_md: artifactBody,
  })
  
  if (insertError) {
    console.error('Failed to insert artifact:', insertError.message)
    process.exit(1)
  }
  
  console.log(`Inserted Implementation artifact for ticket ${ticket.display_id || ticketId}`)
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
