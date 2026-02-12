/**
 * Update a ticket's QA metadata in Supabase: store branch and merge status in frontmatter only.
 * Does not write a "## QA Information" or artifact list into the body; the Kanban UI shows
 * QA info from frontmatter (and Artifacts from the agent_artifacts table).
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
  process.exit(1)
}

function parseFrontmatter(content) {
  if (!content.startsWith('---')) return { frontmatter: {}, body: content }
  const afterFirst = content.slice(3)
  const closeIdx = afterFirst.indexOf('\n---')
  if (closeIdx === -1) return { frontmatter: {}, body: content }
  const block = afterFirst.slice(0, closeIdx).trim()
  const body = afterFirst.slice(closeIdx + 4).trimStart()
  const frontmatter = {}
  for (const line of block.split('\n')) {
    const colon = line.indexOf(':')
    if (colon === -1) continue
    const key = line.slice(0, colon).trim()
    const value = line.slice(colon + 1).trim()
    if (key) frontmatter[key] = value
  }
  return { frontmatter, body }
}

function serializeDoc(frontmatter, body) {
  if (Object.keys(frontmatter).length === 0) return body
  const fmBlock = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join('\n')
  return `---\n${fmBlock}\n---\n${body}`
}

/** Remove any ## QA or ## QA Information block from body (so we don't store it). */
function removeQABlockFromBody(body) {
  const lines = body.split('\n')
  const out = []
  let inQABlock = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    const isQAHeading = /^#{1,6}\s*QA\b/.test(trimmed) || /^\*\*QA\s+Information\*\*\s*$/.test(trimmed)
    const isOtherHeading = /^#{1,6}\s/.test(trimmed) && !/^#{1,6}\s*QA\b/.test(trimmed)
    if (isQAHeading) {
      inQABlock = true
      continue
    }
    if (inQABlock) {
      if (isOtherHeading) {
        inQABlock = false
        out.push(line)
      }
      continue
    }
    out.push(line)
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

async function fetchTicketBody() {
  const client = createClient(supabaseUrl, supabaseAnonKey)
  const { data: row, error: fetchError } = await client
    .from('tickets')
    .select('id, body_md')
    .eq('id', ticketId)
    .single()

  if (fetchError) throw new Error(`Supabase fetch error: ${fetchError.message}`)
  if (!row) throw new Error(`Ticket ${ticketId} not found in Supabase`)
  return row.body_md || ''
}

async function updateViaApi(body_md) {
  const response = await fetch(`${apiUrl}/api/tickets/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticketId, body_md, supabaseUrl, supabaseAnonKey }),
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
  let bodyMd = await fetchTicketBody()
  const { frontmatter, body: bodyOnly } = parseFrontmatter(bodyMd)

  frontmatter.qa_branch = branchName
  frontmatter.qa_merged_to_main = 'yes'

  const bodyWithoutQA = removeQABlockFromBody(bodyOnly)
  const newBodyMd = serializeDoc(frontmatter, bodyWithoutQA)

  const useApi = apiUrl && apiUrl !== 'http://localhost:5173'
  if (useApi) {
    await updateViaApi(newBodyMd)
    console.log(`Updated ticket ${ticketId} QA metadata (frontmatter) via HAL API`)
  } else {
    await updateDirectly(newBodyMd)
    console.log(`Updated ticket ${ticketId} QA metadata (frontmatter) in Supabase`)
  }
  console.log('Run npm run sync-tickets to propagate to docs')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
