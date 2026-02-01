/**
 * Update a ticket's Artifacts section in Supabase.
 * 
 * Usage: node scripts/update-ticket-artifacts.js <ticketId> <shortTitle>
 * 
 * Requires .env with SUPABASE_URL and SUPABASE_ANON_KEY.
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const ticketId = process.argv[2]?.trim()
const shortTitle = process.argv[3]?.trim()

if (!ticketId || !shortTitle) {
  console.error('Usage: node scripts/update-ticket-artifacts.js <ticketId> <shortTitle>')
  console.error('Example: node scripts/update-ticket-artifacts.js 0063 one-click-work-top-ticket-buttons')
  process.exit(1)
}

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_ANON_KEY
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_ANON_KEY in .env')
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

async function main() {
  const client = createClient(url, key)
  
  // Fetch current ticket
  const { data: row, error: fetchError } = await client
    .from('tickets')
    .select('id, body_md')
    .eq('id', ticketId)
    .maybeSingle()

  if (fetchError) {
    console.error('Supabase fetch error:', fetchError.message)
    process.exit(1)
  }

  if (!row) {
    console.error(`Ticket ${ticketId} not found in Supabase.`)
    process.exit(1)
  }

  let body_md = row.body_md || ''

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

  const { error: updateError } = await client
    .from('tickets')
    .update({ body_md })
    .eq('id', ticketId)

  if (updateError) {
    console.error('Supabase update error:', updateError.message)
    process.exit(1)
  }

  console.log(`Updated ticket ${ticketId} Artifacts section in Supabase.`)
  console.log('Kanban UI will reflect the change within ~10 seconds (poll interval).')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
