/**
 * Optionally remove an existing "## Artifacts" section from a ticket's body in Supabase.
 * Artifacts are shown from the agent_artifacts table in the Kanban UI; we no longer
 * write an Artifacts list into the ticket body.
 *
 * Usage: node scripts/update-ticket-artifacts.js <ticketId> [apiUrl] [supabaseUrl] [supabaseAnonKey]
 *
 * If no apiUrl/supabase credentials, script exits after explaining usage.
 * If provided, fetches the ticket body, removes any "## Artifacts" block, and saves.
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const ticketId = process.argv[2]?.trim()
const apiUrl = process.argv[3]?.trim() || process.env.HAL_API_URL || 'http://localhost:5173'
const supabaseUrl = process.argv[4]?.trim() || process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.argv[5]?.trim() || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

if (!ticketId) {
  console.error('Usage: node scripts/update-ticket-artifacts.js <ticketId> [apiUrl] [supabaseUrl] [supabaseAnonKey]')
  console.error('Artifacts are loaded from the database in the Kanban UI; this script only removes any legacy ## Artifacts section from the body.')
  process.exit(1)
}

function removeArtifactsBlockFromBody(body) {
  const lines = body.split('\n')
  const out = []
  let inArtifactsBlock = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    const isArtifactsHeading = /^##\s*Artifacts\s*$/.test(trimmed)
    const isOtherHeading = /^#{1,6}\s/.test(trimmed) && !/^##\s*Artifacts\s*$/.test(trimmed)
    if (isArtifactsHeading) {
      inArtifactsBlock = true
      continue
    }
    if (inArtifactsBlock) {
      if (isOtherHeading) {
        inArtifactsBlock = false
        out.push(line)
      }
      continue
    }
    out.push(line)
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

async function fetchTicketBodyViaApi() {
  const requestBody = { ticketId }
  if (supabaseUrl) requestBody.supabaseUrl = supabaseUrl
  if (supabaseAnonKey) requestBody.supabaseAnonKey = supabaseAnonKey
  const response = await fetch(`${apiUrl}/api/tickets/get`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  })
  if (!response.ok) throw new Error(`API fetch failed: ${response.statusText}`)
  const result = await response.json()
  if (!result.success) throw new Error(result.error || `Ticket ${ticketId} not found.`)
  return result.body_md || ''
}

async function fetchTicketBody() {
  if (!supabaseUrl || !supabaseAnonKey) throw new Error('Supabase credentials required for direct access')
  const client = createClient(supabaseUrl, supabaseAnonKey)
  const { data: row, error } = await client.from('tickets').select('id, body_md').eq('id', ticketId).maybeSingle()
  if (error) throw new Error(`Supabase fetch error: ${error.message}`)
  if (!row) throw new Error(`Ticket ${ticketId} not found in Supabase.`)
  return row.body_md || ''
}

async function updateViaApi(body_md) {
  const requestBody = { ticketId, body_md }
  if (supabaseUrl) requestBody.supabaseUrl = supabaseUrl
  if (supabaseAnonKey) requestBody.supabaseAnonKey = supabaseAnonKey
  const response = await fetch(`${apiUrl}/api/tickets/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  })
  const result = await response.json()
  if (!result.success) throw new Error(result.error || 'API update failed')
}

async function updateDirectly(body_md) {
  const client = createClient(supabaseUrl, supabaseAnonKey)
  const { error } = await client.from('tickets').update({ body_md }).eq('id', ticketId)
  if (error) throw new Error(`Supabase update error: ${error.message}`)
}

async function main() {
  const useApi = !!apiUrl
  let body_md = useApi ? await fetchTicketBodyViaApi() : await fetchTicketBody()
  const cleaned = removeArtifactsBlockFromBody(body_md)
  if (cleaned === body_md) {
    console.log(`Ticket ${ticketId}: no ## Artifacts section in body; nothing to change.`)
    return
  }
  if (useApi) {
    await updateViaApi(cleaned)
    console.log(`Removed ## Artifacts section from ticket ${ticketId} via HAL API.`)
  } else if (supabaseUrl && supabaseAnonKey) {
    await updateDirectly(cleaned)
    console.log(`Removed ## Artifacts section from ticket ${ticketId} in Supabase.`)
  } else {
    console.error('Provide apiUrl or SUPABASE_URL/SUPABASE_ANON_KEY to update.')
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
