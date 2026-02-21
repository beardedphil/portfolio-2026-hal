import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { parseSupabaseCredentialsWithServiceRole, readJsonBody } from '../tickets/_shared.js'
import { createCanonicalTitle, findArtifactsByCanonicalId } from '../artifacts/_shared.js'
import { insertArtifact } from '../artifacts/_artifact-operations.js'

function json(res: ServerResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // CORS: allow calling from Kanban UI/admin tools
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

  const startedAt = Date.now()

  try {
    const body = (await readJsonBody(req)) as {
      repoFullName?: string
      dryRun?: boolean
      cursor?: number
      limit?: number
      maxRuntimeMs?: number
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const repoFullName = typeof body.repoFullName === 'string' ? body.repoFullName.trim() || undefined : undefined
    const dryRun = body.dryRun === true
    const cursor = Number.isFinite(body.cursor) ? Math.max(0, Math.floor(body.cursor as number)) : 0
    const limitRaw = Number.isFinite(body.limit) ? Math.floor(body.limit as number) : 50
    const limit = Math.max(1, Math.min(250, limitRaw))
    const maxRuntimeMsRaw = Number.isFinite(body.maxRuntimeMs) ? Math.floor(body.maxRuntimeMs as number) : 25_000
    const maxRuntimeMs = Math.max(3_000, Math.min(55_000, maxRuntimeMsRaw))

    const { supabaseUrl, supabaseKey } = parseSupabaseCredentialsWithServiceRole(body)
    if (!supabaseUrl || !supabaseKey) {
      json(res, 400, {
        success: false,
        error:
          'Supabase service credentials required (provide in request body or set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SECRET_KEY in server environment).',
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Fetch To Do tickets (paged)
    let ticketsQuery = supabase
      .from('tickets')
      .select('pk, repo_full_name, display_id, ticket_number')
      .eq('kanban_column_id', 'col-todo')
      .order('updated_at', { ascending: false })
      .range(cursor, cursor + limit - 1)

    if (repoFullName) {
      ticketsQuery = ticketsQuery.eq('repo_full_name', repoFullName)
    }

    const { data: tickets, error: ticketsErr } = await ticketsQuery
    if (ticketsErr) {
      json(res, 200, { success: false, error: `Failed to list To Do tickets: ${ticketsErr.message}` })
      return
    }

    const rows = (tickets ?? []) as Array<{
      pk: string
      repo_full_name: string | null
      display_id: string | null
      ticket_number: number | null
    }>

    let created = 0
    let skippedExisting = 0
    let skippedNoRed = 0
    const errors: Array<{ ticketPk: string; error: string }> = []

    for (const t of rows) {
      if (Date.now() - startedAt > maxRuntimeMs) break
      if (!t?.pk || !t.repo_full_name) continue

      try {
        // Skip if mirrored RED artifact already exists (idempotent).
        const { artifacts: existing, error: findErr } = await findArtifactsByCanonicalId(
          supabase,
          t.pk,
          'implementation',
          'red'
        )
        if (findErr) throw new Error(findErr)
        if ((existing ?? []).length > 0) {
          skippedExisting++
          continue
        }

        // Find latest RED document for this ticket.
        const { data: red, error: redErr } = await supabase
          .from('hal_red_documents')
          .select('red_id, version, red_json, validation_status, created_at, artifact_id')
          .eq('repo_full_name', t.repo_full_name)
          .eq('ticket_pk', t.pk)
          .order('version', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (redErr) throw new Error(redErr.message)
        if (!red?.red_id) {
          skippedNoRed++
          continue
        }

        const displayId = t.display_id || (t.ticket_number != null ? String(t.ticket_number).padStart(4, '0') : t.pk)
        const canonicalTitle = createCanonicalTitle('red', displayId)
        const createdAt =
          typeof red.created_at === 'string' && red.created_at ? red.created_at : new Date().toISOString()
        const version = Number(red.version ?? 0) || 0
        const status =
          typeof red.validation_status === 'string' && red.validation_status
            ? red.validation_status
            : 'pending'
        const redJsonForArtifact = (red as any).red_json ?? null

        const body_md = `# RED Document Version ${version}

RED ID: ${String(red.red_id)}
Created: ${createdAt}
Validation Status: ${status}

## Canonical RED JSON

\`\`\`json
${JSON.stringify(redJsonForArtifact, null, 2)}
\`\`\`
`

        if (!dryRun) {
          const ins = await insertArtifact(supabase, t.pk, t.repo_full_name, 'implementation', canonicalTitle, body_md)
          if (!ins.success || !ins.artifact_id) {
            throw new Error(ins.error || 'Failed to insert artifact')
          }

          // Best-effort: link RED row to artifact for easier UI/joins.
          if (!red.artifact_id) {
            await supabase
              .from('hal_red_documents')
              .update({ artifact_id: ins.artifact_id })
              .eq('red_id', red.red_id)
          }
        }

        created++
      } catch (e) {
        errors.push({
          ticketPk: String(t.pk || ''),
          error: e instanceof Error ? e.message : String(e),
        })
      }
    }

    const processed = Math.min(rows.length, errors.length + created + skippedExisting + skippedNoRed)
    const nextCursor =
      cursor + processed < cursor + rows.length ? cursor + processed : rows.length < limit ? null : cursor + processed

    json(res, 200, {
      success: true,
      dryRun,
      repoFullName: repoFullName || null,
      cursor,
      limit,
      maxRuntimeMs,
      processedTickets: processed,
      createdArtifacts: created,
      skippedExisting,
      skippedNoRed,
      errors,
      nextCursor,
      done: nextCursor == null,
    })
  } catch (err) {
    json(res, 500, { success: false, error: err instanceof Error ? err.message : String(err) })
  }
}

