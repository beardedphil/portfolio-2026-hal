import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return {}
  return JSON.parse(raw) as unknown
}

function json(res: ServerResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

/** Slug for ticket filename: lowercase, spaces to hyphens, strip non-alphanumeric except hyphen. */
function slugFromTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'ticket'
}

function repoHintPrefix(repoFullName: string): string {
  const repo = repoFullName.split('/').pop() ?? repoFullName
  const tokens = repo
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter(Boolean)

  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i]
    if (!/[a-z]/.test(t)) continue
    if (t.length >= 2 && t.length <= 6) return t.toUpperCase()
  }

  const letters = repo.replace(/[^a-zA-Z]/g, '').toUpperCase()
  return (letters.slice(0, 4) || 'PRJ').toUpperCase()
}

function isUniqueViolation(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  if (err.code === '23505') return true
  const msg = (err.message ?? '').toLowerCase()
  return msg.includes('duplicate key') || msg.includes('unique constraint')
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // CORS: Allow cross-origin requests
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  if (req.method !== 'POST') {
    res.statusCode = 405
    res.end('Method Not Allowed')
    return
  }

  try {
    const body = (await readJsonBody(req)) as {
      sourceTicketId?: string
      sourceTicketPk?: string
      suggestions?: string[]
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const sourceTicketPk = typeof body.sourceTicketPk === 'string' ? body.sourceTicketPk.trim() : undefined
    const sourceTicketId = typeof body.sourceTicketId === 'string' ? body.sourceTicketId.trim() : undefined
    const suggestions = Array.isArray(body.suggestions) ? body.suggestions.filter((s) => typeof s === 'string' && s.trim()) : []

    // Use credentials from request body if provided, otherwise fall back to server environment variables
    const supabaseUrl =
      (typeof body.supabaseUrl === 'string' ? body.supabaseUrl.trim() : undefined) ||
      process.env.SUPABASE_URL?.trim() ||
      process.env.VITE_SUPABASE_URL?.trim() ||
      undefined
    const supabaseAnonKey =
      (typeof body.supabaseAnonKey === 'string' ? body.supabaseAnonKey.trim() : undefined) ||
      process.env.SUPABASE_ANON_KEY?.trim() ||
      process.env.VITE_SUPABASE_ANON_KEY?.trim() ||
      undefined

    if ((!sourceTicketPk && !sourceTicketId) || !supabaseUrl || !supabaseAnonKey) {
      json(res, 400, {
        success: false,
        error: 'sourceTicketPk (preferred) or sourceTicketId, and Supabase credentials are required.',
      })
      return
    }

    if (suggestions.length === 0) {
      json(res, 400, {
        success: false,
        error: 'At least one suggestion is required to create a ticket.',
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Fetch source ticket to get repo info
    const sourceTicketQuery = sourceTicketPk
      ? await supabase.from('tickets').select('pk, id, display_id, title, repo_full_name').eq('pk', sourceTicketPk).maybeSingle()
      : await supabase.from('tickets').select('pk, id, display_id, title, repo_full_name').eq('id', sourceTicketId!).maybeSingle()

    if (sourceTicketQuery.error || !sourceTicketQuery.data) {
      json(res, 200, {
        success: false,
        error: `Source ticket not found: ${sourceTicketQuery.error?.message || 'Unknown error'}`,
      })
      return
    }

    const sourceTicket = sourceTicketQuery.data
    const repoFullName = sourceTicket.repo_full_name || 'legacy/unknown'
    const prefix = repoHintPrefix(repoFullName)

    // Determine next ticket number (repo-scoped)
    let startNum = 1
    try {
      const { data: existingRows, error: fetchError } = await supabase
        .from('tickets')
        .select('ticket_number')
        .eq('repo_full_name', repoFullName)
        .order('ticket_number', { ascending: false })
        .limit(1)

      if (!fetchError && existingRows && existingRows.length > 0) {
        const maxNum = (existingRows[0] as { ticket_number?: number }).ticket_number ?? 0
        startNum = maxNum + 1
      }
    } catch {
      // Fallback to 1 if query fails
    }

    // Generate ticket content from suggestions
    const suggestionsText = suggestions.map((s, i) => `- ${s}`).join('\n')
    const sourceRef = sourceTicket.display_id || sourceTicket.id
    const title = `Improve agent instructions based on ${sourceRef} Process Review`
    const bodyMd = `# Ticket

- **ID**: (auto-assigned)
- **Title**: (auto-assigned)
- **Owner**: Implementation agent
- **Type**: Process
- **Priority**: P2

## Linkage (for tracking)

- **Proposed from**: ${sourceRef} — Process Review

## Goal (one sentence)

Improve agent instructions and process documentation based on review of ticket ${sourceRef} artifacts.

## Human-verifiable deliverable (UI-only)

Updated agent rules, templates, or process documentation that addresses the suggested improvements below.

## Acceptance criteria (UI-only)

- [ ] Agent instructions/rules updated to address the suggestions
- [ ] Changes are documented and tested
- [ ] Process improvements are reflected in relevant documentation

## Constraints

- Keep changes focused on agent instructions and process, not implementation code
- Ensure changes are backward compatible where possible

## Non-goals

- Implementation code changes
- Feature additions unrelated to process improvement

## Suggested improvements

${suggestionsText}

## Implementation notes (optional)

This ticket was automatically created from Process Review suggestions for ticket ${sourceRef}. Review the suggestions above and implement the appropriate improvements to agent instructions, rules, or process documentation.
`

    // Try to create ticket with retries for ID collisions
    const MAX_RETRIES = 10
    let lastInsertError: { code?: string; message?: string } | null = null

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const candidateNum = startNum + attempt
      const displayId = `${prefix}-${String(candidateNum).padStart(4, '0')}`
      const id = String(candidateNum)
      const filename = `${String(candidateNum).padStart(4, '0')}-${slugFromTitle(title)}.md`
      const now = new Date().toISOString()

      try {
        // Try new schema first (repo-scoped)
        const insert = await supabase.from('tickets').insert({
          pk: crypto.randomUUID(),
          repo_full_name: repoFullName,
          ticket_number: candidateNum,
          display_id: displayId,
          id,
          filename,
          title: `${displayId} — ${title}`,
          body_md: bodyMd,
          kanban_column_id: 'col-unassigned',
          kanban_position: 0,
          kanban_moved_at: now,
        })

        if (!insert.error) {
          json(res, 200, {
            success: true,
            ticketId: displayId,
            id,
            pk: insert.data?.[0]?.pk || crypto.randomUUID(),
          })
          return
        }

        // Check if it's a unique violation (we can retry)
        if (!isUniqueViolation(insert.error)) {
          json(res, 200, {
            success: false,
            error: `Failed to create ticket: ${insert.error.message}`,
          })
          return
        }

        lastInsertError = insert.error
      } catch (err) {
        lastInsertError = err as { code?: string; message?: string }
      }
    }

    json(res, 200, {
      success: false,
      error: `Could not create ticket after ${MAX_RETRIES} attempts (ID collision). Last error: ${lastInsertError?.message || 'unknown'}`,
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
