/**
 * Update a ticket's Artifacts section in Supabase via HAL API.
 * 
 * Usage: node scripts/update-ticket-artifacts.js <ticketId> <shortTitle> [apiUrl] [supabaseUrl] [supabaseAnonKey]
 * 
 * Credentials can be provided via:
 * - CLI arguments (apiUrl, supabaseUrl, supabaseAnonKey)
 * - Environment variables (SUPABASE_URL, SUPABASE_ANON_KEY)
 * - .env file (SUPABASE_URL, SUPABASE_ANON_KEY)
 * 
 * If apiUrl is provided, uses HAL API endpoint. Otherwise, uses Supabase directly.
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const ticketId = process.argv[2]?.trim()
const shortTitle = process.argv[3]?.trim()
const apiUrl = process.argv[4]?.trim() || process.env.HAL_API_URL || 'http://localhost:5173'
const supabaseUrl = process.argv[5]?.trim() || process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.argv[6]?.trim() || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

if (!ticketId || !shortTitle) {
  console.error('Usage: node scripts/update-ticket-artifacts.js <ticketId> <shortTitle> [apiUrl] [supabaseUrl] [supabaseAnonKey]')
  console.error('Example: node scripts/update-ticket-artifacts.js 0063 one-click-work-top-ticket-buttons')
  console.error('Example (with API): node scripts/update-ticket-artifacts.js 0063 one-click-work-top-ticket-buttons http://localhost:5173 <url> <key>')
  process.exit(1)
}

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Set SUPABASE_URL and SUPABASE_ANON_KEY in .env, or pass as CLI arguments')
  process.exit(1)
}

const artifactsSection = `## Artifacts

- [plan.md](docs/audit/${ticketId}-${shortTitle}/plan.md)
- [worklog.md](docs/audit/${ticketId}-${shortTitle}/worklog.md)
- [changed-files.md](docs/audit/${ticketId}-${shortTitle}/changed-files.md)
- [decisions.md](docs/audit/${ticketId}-${shortTitle}/decisions.md)
- [verification.md](docs/audit/${ticketId}-${shortTitle}/verification.md)
- [pm-review.md](docs/audit/${ticketId}-${shortTitle}/pm-review.md)
- [qa-report.md](docs/audit/${ticketId}-${shortTitle}/qa-report.md)
`

async function fetchTicketBody() {
  const client = createClient(supabaseUrl, supabaseAnonKey)
  const { data: row, error: fetchError } = await client
    .from('tickets')
    .select('id, body_md')
    .eq('id', ticketId)
    .maybeSingle()

  if (fetchError) {
    throw new Error(`Supabase fetch error: ${fetchError.message}`)
  }

  if (!row) {
    throw new Error(`Ticket ${ticketId} not found in Supabase.`)
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
  let body_md = await fetchTicketBody()

  // Check if Artifacts section already exists
  const artifactsRegex = /^## Artifacts\s*$/m
  if (artifactsRegex.test(body_md)) {
    // Replace existing Artifacts section
    const lines = body_md.split('\n')
    const startIdx = lines.findIndex(line => line.trim() === '## Artifacts')
    if (startIdx !== -1) {
      // Find the end of the section (next ## heading or end of file)
      let endIdx = startIdx + 1
      while (endIdx < lines.length && !lines[endIdx].trim().startsWith('##')) {
        endIdx++
      }
      // Replace the section
      body_md = [
        ...lines.slice(0, startIdx),
        artifactsSection.trim(),
        ...lines.slice(endIdx)
      ].join('\n')
    }
  } else {
    // Append Artifacts section at the end
    body_md = body_md.trim() + '\n\n' + artifactsSection.trim()
  }

  // Update via API if apiUrl is provided and not localhost default, otherwise use direct Supabase
  const useApi = apiUrl && apiUrl !== 'http://localhost:5173'
  if (useApi) {
    await updateViaApi(body_md)
    console.log(`Updated ticket ${ticketId} Artifacts section via HAL API.`)
  } else {
    await updateDirectly(body_md)
    console.log(`Updated ticket ${ticketId} Artifacts section in Supabase.`)
  }
  
  console.log('Kanban UI will reflect the change within ~10 seconds (poll interval).')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
