import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { getSession } from '../_lib/github/session.js'
import { githubFetch } from '../_lib/github/client.js'
import { readJsonBody, json, parseSupabaseCredentialsWithServiceRole } from './_shared.js'

function parseGithubPrUrl(prUrl: string): { owner: string; repo: string; pullNumber: number } | null {
  const m = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/i)
  if (!m) return null
  const [, owner, repo, n] = m
  const pullNumber = parseInt(n, 10)
  if (!owner || !repo || !Number.isFinite(pullNumber)) return null
  return { owner, repo, pullNumber }
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // CORS: Allow cross-origin requests (for scripts calling from different origins)
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
      ticketPk?: string
      ticketId?: string
      repoFullName?: string
      prUrl?: string
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const ticketPk = typeof body.ticketPk === 'string' ? body.ticketPk.trim() : ''
    const ticketId = typeof body.ticketId === 'string' ? body.ticketId.trim() : ''
    const repoFullNameFromClient = typeof body.repoFullName === 'string' ? body.repoFullName.trim() : ''
    const prUrl = typeof body.prUrl === 'string' ? body.prUrl.trim() : ''

    if (!ticketPk && !ticketId) {
      json(res, 400, { success: false, error: 'ticketPk (preferred) or ticketId is required.' })
      return
    }
    if (!prUrl) {
      json(res, 400, { success: false, error: 'prUrl is required.' })
      return
    }

    const parsed = parseGithubPrUrl(prUrl)
    if (!parsed) {
      json(res, 400, { success: false, error: 'Invalid PR URL. Expected https://github.com/owner/repo/pull/123' })
      return
    }

    // Get GitHub token from session or environment (for agent use)
    let session: Awaited<ReturnType<typeof getSession>> | null = null
    try {
      session = await getSession(req, res)
    } catch {
      // Session may not be available for agent calls
    }
    const ghToken =
      session?.github?.accessToken || process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim()
    if (!ghToken) {
      json(res, 401, {
        success: false,
        error: 'Not authenticated with GitHub. Provide GITHUB_TOKEN or GH_TOKEN in server environment, or authenticate via session.',
      })
      return
    }

    // Validate the PR exists and is accessible.
    const prApiUrl = `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/pulls/${parsed.pullNumber}`
    const pr = await githubFetch<{ html_url?: string }>(ghToken, prApiUrl, { method: 'GET' })
    const canonicalPrUrl = typeof pr?.html_url === 'string' && pr.html_url.trim() ? pr.html_url.trim() : prUrl

    const { supabaseUrl, supabaseKey } = parseSupabaseCredentialsWithServiceRole(body)
    if (!supabaseUrl || !supabaseKey) {
      json(res, 503, { success: false, error: 'Supabase server env is missing.' })
      return
    }
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Fetch ticket by pk or id
    let ticket: { pk: string; repo_full_name?: string; ticket_number?: number; display_id?: string } | null = null
    if (ticketPk) {
      const { data, error: ticketErr } = await supabase
        .from('tickets')
        .select('pk, repo_full_name, ticket_number, display_id')
        .eq('pk', ticketPk)
        .maybeSingle()
      if (ticketErr || !data?.pk) {
        json(res, 404, { success: false, error: 'Ticket not found.' })
        return
      }
      ticket = data
    } else if (ticketId) {
      // Try to find ticket by ticket_number or display_id
      const ticketNumber = parseInt(ticketId, 10)
      if (!Number.isNaN(ticketNumber)) {
        const { data, error: ticketErr } = await supabase
          .from('tickets')
          .select('pk, repo_full_name, ticket_number, display_id')
          .eq('ticket_number', ticketNumber)
          .maybeSingle()
        if (!ticketErr && data?.pk) {
          ticket = data
        }
      }
      if (!ticket) {
        const { data, error: ticketErr } = await supabase
          .from('tickets')
          .select('pk, repo_full_name, ticket_number, display_id')
          .eq('display_id', ticketId)
          .maybeSingle()
        if (ticketErr || !data?.pk) {
          json(res, 404, { success: false, error: 'Ticket not found.' })
          return
        }
        ticket = data
      }
    }

    if (!ticket?.pk) {
      json(res, 404, { success: false, error: 'Ticket not found.' })
      return
    }

    const resolvedTicketPk = ticket.pk

    const ticketRepo = String((ticket as any).repo_full_name ?? '')
    const expectedRepo = repoFullNameFromClient || ticketRepo
    const prRepoFullName = `${parsed.owner}/${parsed.repo}`
    if (expectedRepo && prRepoFullName.toLowerCase() !== expectedRepo.toLowerCase()) {
      json(res, 400, {
        success: false,
        error: `PR repo mismatch. Ticket repo is ${expectedRepo}, but PR is ${prRepoFullName}.`,
      })
      return
    }

    const displayId = String((ticket as any).display_id ?? '')
    const ticketNumber = (ticket as any).ticket_number ?? null

    // Insert a terminal run row that carries pr_url so ticket can pass the move gate.
    const { error: insErr } = await supabase.from('hal_agent_runs').insert({
      agent_type: 'pr-link',
      repo_full_name: ticketRepo || expectedRepo || prRepoFullName,
      ticket_pk: resolvedTicketPk,
      ticket_number: ticketNumber,
      display_id: displayId || null,
      pr_url: canonicalPrUrl,
      summary: `Linked PR: ${canonicalPrUrl}`,
      status: 'finished',
      current_stage: 'completed',
    })
    if (insErr) {
      json(res, 500, { success: false, error: `Failed to link PR: ${insErr.message}` })
      return
    }

    json(res, 200, { success: true, prUrl: canonicalPrUrl })
  } catch (err) {
    json(res, 500, { success: false, error: err instanceof Error ? err.message : String(err) })
  }
}

