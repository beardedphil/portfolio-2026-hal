/**
 * Update a ticket's QA section in Supabase with branch name and audit artifact links via HAL API.
 * 
 * Usage: node scripts/update-ticket-qa-section.js <ticketId> <branchName> [apiUrl] [supabaseUrl] [supabaseAnonKey]
 * 
 * Credentials can be provided via:
 * - CLI arguments (apiUrl, supabaseUrl, supabaseAnonKey)
 * - Environment variables (SUPABASE_URL, SUPABASE_ANON_KEY)
 * - .env file (SUPABASE_URL, SUPABASE_ANON_KEY)
 * 
 * If apiUrl is provided, uses HAL API endpoint. Otherwise, uses Supabase directly.
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
const apiUrl = process.argv[4]?.trim() || process.env.HAL_API_URL || 'http://localhost:5173'
const supabaseUrl = process.argv[5]?.trim() || process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.argv[6]?.trim() || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

if (!ticketId) {
  console.error('Usage: node scripts/update-ticket-qa-section.js <ticketId> <branchName> [apiUrl] [supabaseUrl] [supabaseAnonKey]')
  process.exit(1)
}

if (!branchName) {
  console.error('Usage: node scripts/update-ticket-qa-section.js <ticketId> <branchName> [apiUrl] [supabaseUrl] [supabaseAnonKey]')
  process.exit(1)
}

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Set SUPABASE_URL and SUPABASE_ANON_KEY in .env (or as environment variables), or pass as CLI arguments.')
  console.error('Alternatively, set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
  process.exit(1)
}

async function fetchTicketBody() {
  const client = createClient(supabaseUrl, supabaseAnonKey)
  const { data: row, error: fetchError } = await client
    .from('tickets')
    .select('id, body_md')
    .eq('id', ticketId)
    .single()
  
  if (fetchError) {
    throw new Error(`Supabase fetch error: ${fetchError.message}`)
  }
  
  if (!row) {
    throw new Error(`Ticket ${ticketId} not found in Supabase`)
  }
  
  return row.body_md || ''
}

async function updateViaApi(body_md) {
  const response = await fetch(`${apiUrl}/api/tickets/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ticketId,
      body_md,
      supabaseUrl,
      supabaseAnonKey,
    }),
  })

  const result = await response.json()
  if (!result.success) {
    throw new Error(result.error || 'API update failed')
  }
}

async function updateDirectly(body_md) {
  const client = createClient(supabaseUrl, supabaseAnonKey)
  const { error: updateError } = await client
    .from('tickets')
    .update({ body_md })
    .eq('id', ticketId)
  
  if (updateError) {
    throw new Error(`Supabase update error: ${updateError.message}`)
  }
}

async function main() {
  // Fetch current ticket body
  let bodyMd = await fetchTicketBody()
  
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
  
  // Update via API if apiUrl is provided and not localhost default, otherwise use direct Supabase
  const useApi = apiUrl && apiUrl !== 'http://localhost:5173'
  if (useApi) {
    await updateViaApi(bodyMd)
    console.log(`Updated ticket ${ticketId} QA section via HAL API`)
  } else {
    await updateDirectly(bodyMd)
    console.log(`Updated ticket ${ticketId} QA section in Supabase`)
  }
  
  console.log('Run npm run sync-tickets to propagate to docs')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
