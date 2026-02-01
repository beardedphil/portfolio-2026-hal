/**
 * Update a ticket's QA section in Supabase with branch name and audit artifact links.
 * 
 * Usage: node scripts/update-ticket-qa-section.js <ticketId> <branchName>
 * 
 * Requires .env with SUPABASE_URL and SUPABASE_ANON_KEY.
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = process.env.PROJECT_ROOT
  ? path.resolve(process.env.PROJECT_ROOT)
  : path.resolve(__dirname, '..')

// Load .env from project root
config({ path: path.join(projectRoot, '.env') })

const ticketId = process.argv[2]?.trim()
const branchName = process.argv[3]?.trim()

if (!ticketId) {
  console.error('Usage: node scripts/update-ticket-qa-section.js <ticketId> <branchName>')
  process.exit(1)
}

if (!branchName) {
  console.error('Usage: node scripts/update-ticket-qa-section.js <ticketId> <branchName>')
  process.exit(1)
}

// Try to get credentials from environment (set directly or from .env)
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_ANON_KEY in .env (or as environment variables) and run from project root.')
  console.error('Alternatively, set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
  process.exit(1)
}

async function main() {
  const client = createClient(url, key)
  
  // Fetch current ticket
  const { data: row, error: fetchError } = await client
    .from('tickets')
    .select('id, body_md')
    .eq('id', ticketId)
    .single()
  
  if (fetchError) {
    console.error('Supabase fetch error:', fetchError.message)
    process.exit(1)
  }
  
  if (!row) {
    console.error(`Ticket ${ticketId} not found in Supabase`)
    process.exit(1)
  }
  
  let bodyMd = row.body_md || ''
  
  // Update or add QA section
  const qaSection = `## QA (implementation agent fills when work is pushed)

- **Branch**: \`${branchName}\` — Merged to main for cloud QA access. QA performs code review + automated verification (no manual UI testing). When satisfied, QA merges to \`main\` and moves the ticket to **Human in the Loop**.
- **Merged to main for QA**: Yes (cloud QA branch access limitation)
- **Audit artifacts**:
  - [plan.md](docs/audit/${ticketId}-implementation/plan.md)
  - [worklog.md](docs/audit/${ticketId}-implementation/worklog.md)
  - [changed-files.md](docs/audit/${ticketId}-implementation/changed-files.md)
  - [decisions.md](docs/audit/${ticketId}-implementation/decisions.md)
  - [verification.md](docs/audit/${ticketId}-implementation/verification.md)
  - [pm-review.md](docs/audit/${ticketId}-implementation/pm-review.md)`
  
  // Replace existing QA section or add it after "## QA" heading
  if (bodyMd.includes('## QA')) {
    // Replace existing QA section
    const qaRegex = /## QA[^\n]*\n([\s\S]*?)(?=\n## |$)/i
    if (qaRegex.test(bodyMd)) {
      bodyMd = bodyMd.replace(qaRegex, qaSection)
    } else {
      // QA heading exists but no content, add after it
      bodyMd = bodyMd.replace(/## QA[^\n]*/i, qaSection)
    }
  } else {
    // Add QA section before "## Human in the Loop" or at the end
    if (bodyMd.includes('## Human in the Loop')) {
      bodyMd = bodyMd.replace('## Human in the Loop', `${qaSection}\n\n## Human in the Loop`)
    } else {
      bodyMd = bodyMd + '\n\n' + qaSection
    }
  }
  
  // Update in Supabase
  const { error: updateError } = await client
    .from('tickets')
    .update({ body_md: bodyMd })
    .eq('id', ticketId)
  
  if (updateError) {
    console.error('Supabase update error:', updateError.message)
    process.exit(1)
  }
  
  console.log(`Updated ticket ${ticketId} QA section in Supabase`)
  console.log('Run npm run sync-tickets to propagate to docs')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
