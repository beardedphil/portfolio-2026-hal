/**
 * Create a new ticket in Supabase and optionally run sync-tickets.
 * Use when adding a ticket outside the HAL PM agent (e.g. one-off script).
 *
 * Usage: node scripts/create-ticket-in-supabase.js [--no-sync]
 *   --no-sync  Skip running sync-tickets after insert (default: run sync)
 *
 * Requires .env with SUPABASE_URL and SUPABASE_ANON_KEY.
 * Run from project root.
 */

import 'dotenv/config'
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { spawn } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

function slugFromTitle(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

async function runSyncTickets() {
  const syncScriptPath = path.join(projectRoot, 'scripts', 'sync-tickets.js')
  return new Promise((resolve, reject) => {
    const child = spawn('node', [syncScriptPath], {
      cwd: projectRoot,
      stdio: 'inherit',
      env: { ...process.env, PROJECT_ROOT: projectRoot },
    })
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`sync-tickets exited ${code}`))))
  })
}

const TICKET_BODY = `## Ticket

- **ID**: <ID>
- **Title**: Implementation Agent full workflow via Cursor Cloud Agents API
- **Owner**: Implementation agent
- **Type**: Feature
- **Priority**: P0

## QA (implementation agent fills when work is pushed)

- **Branch**: \`ticket/<ID>-implementation-agent-cursor-cloud-agents-api\`

## Human in the Loop

After QA merges, the ticket moves to **Human in the Loop**. The user tests at http://localhost:5173.

## Goal (one sentence)

Wire the Implementation Agent to the Cursor Cloud Agents API so that when the user sends a message with a connected GitHub-backed project, HAL launches a cloud agent to perform the task and displays progress and results in-app.

## Human-verifiable deliverable (UI-only)

When **Implementation Agent** is selected and the user sends a message (e.g. "Add a README with installation instructions"):
- The UI shows a run started and displays a status timeline (Preparing → Launching agent → Polling / Waiting → Completed / Failed).
- When the agent completes, the UI shows the result (e.g. summary, PR link if autoCreatePr) in the chat.
- If the connected project is not a GitHub repo or cannot be resolved, the UI shows a clear, user-readable error (no console required).

## Acceptance criteria (UI-only)

- [ ] With Implementation Agent selected and a GitHub-backed project connected, sending a message triggers \`POST /v0/agents\` with the user message as \`prompt.text\` and the repo URL as \`source.repository\`.
- [ ] The UI shows a status timeline during the run (e.g. Launching → Running → Completed/Failed).
- [ ] When the agent completes (status FINISHED), the UI displays the summary and PR link (if applicable) in the chat thread.
- [ ] The UI supports polling \`GET /v0/agents/{id}\` for status, or displays a link to the Cursor agent URL for manual monitoring.
- [ ] If the connected project has no GitHub remote or cannot be resolved to a GitHub URL, the UI shows a clear error without attempting the request.
- [ ] If Cursor API is not configured or the request fails, the UI shows a human-readable error state (no stack trace).

## Constraints

- Keep the scope focused on: launch agent, poll/display status, show result. Defer follow-up messages and advanced options.
- Verification must require **no external tools** (no terminal, no devtools, no console).
- Do not display secrets (API keys) anywhere.
- Resolve GitHub repo URL from connected project path (e.g. \`git remote get-url origin\` or equivalent).

## Non-goals

- Webhook-based status updates (polling is sufficient for MVP).
- Supporting non-GitHub repos (Cursor Cloud Agents API requires GitHub).
- Add follow-up (\`POST /v0/agents/{id}/followup\`) in this ticket.
- Stop/delete agent from HAL UI.

## Implementation notes (optional)

- Cursor Cloud Agents API: https://cursor.com/docs/cloud-agent/api/endpoints
- Launch agent: \`POST /v0/agents\` with \`prompt.text\`, \`source.repository\`, \`source.ref\`, optional \`target.autoCreatePr\`, \`target.branchName\`.
- Agent status: \`GET /v0/agents/{id}\` — status values: CREATING, RUNNING, FINISHED, etc.
- Resolve \`source.repository\` from connected project: run \`git remote get-url origin\` in project root; normalize to \`https://github.com/owner/repo\` form.
- Reuse existing \`/api/implementation-agent/run\` proxy pattern; extend to \`POST /v0/agents\` instead of \`GET /v0/me\`.

## Audit artifacts required (implementation agent)

Create \`docs/audit/<ID>-implementation-agent-cursor-cloud-agents-api/\` containing:
- \`plan.md\`
- \`worklog.md\`
- \`changed-files.md\`
- \`decisions.md\`
- \`verification.md\` (UI-only)
- \`pm-review.md\`
`

async function main() {
  const skipSync = process.argv.includes('--no-sync')
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) {
    console.error('Set SUPABASE_URL and SUPABASE_ANON_KEY (or VITE_ variants) in .env.')
    process.exit(1)
  }

  const client = createClient(url, key)

  const { data: existingRows, error: fetchError } = await client
    .from('tickets')
    .select('id')
    .order('id', { ascending: true })

  if (fetchError) {
    console.error('Supabase fetch error:', fetchError.message)
    process.exit(1)
  }

  const ids = (existingRows ?? []).map((r) => r.id)
  const numericIds = ids
    .map((id) => {
      const n = parseInt(id, 10)
      return Number.isNaN(n) ? 0 : n
    })
    .filter((n) => n >= 0)
  const nextNum = numericIds.length > 0 ? Math.max(...numericIds) + 1 : 1
  const id = String(nextNum).padStart(4, '0')
  const title = 'Implementation Agent full workflow via Cursor Cloud Agents API'
  const slug = slugFromTitle(title)
  const filename = `${id}-${slug}.md`
  const titleWithId = `${id} - ${title}`
  const body_md = TICKET_BODY.replace(/<ID>/g, id)
  const now = new Date().toISOString()

  const { error: insertError } = await client.from('tickets').insert({
    pk: crypto.randomUUID(),
    id,
    filename,
    title: titleWithId,
    body_md,
    kanban_column_id: 'col-unassigned',
    kanban_position: 0,
    kanban_moved_at: now,
  })

  if (insertError) {
    console.error('Supabase insert error:', insertError.message)
    process.exit(1)
  }

  console.log(`Created ticket ${id} in Supabase: ${filename}`)
  console.log(`Title: ${titleWithId}`)

  if (!skipSync) {
    await runSyncTickets()
    console.log('Ran sync-tickets. Ticket file written to docs/tickets/')
  } else {
    console.log('Skipped sync-tickets. Run: npm run sync-tickets')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
