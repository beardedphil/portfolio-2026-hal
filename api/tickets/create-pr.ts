import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { getSession } from '../_lib/github/session.js'
import { githubFetch } from '../_lib/github/client.js'
import { ensureInitialCommit, getDefaultBranch, listBranches } from '../_lib/github/repos.js'
import { readJsonBody, json, parseSupabaseCredentialsWithServiceRole } from './_shared.js'

function padTicketNumber(n: number | null | undefined): string {
  const v = typeof n === 'number' ? n : parseInt(String(n ?? ''), 10)
  return Number.isFinite(v) ? String(v).padStart(4, '0') : '0000'
}

function safeFileSlug(s: string): string {
  return String(s)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

async function ensureBranchExists(args: {
  token: string
  repoFullName: string
  base: string
  branch: string
}): Promise<{ ok: true } | { error: string }> {
  const [owner, repo] = args.repoFullName.split('/')
  if (!owner || !repo) return { error: 'Invalid repo: expected owner/repo' }

  const baseRefUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(args.base)}`
  const baseRef = (await githubFetch<{ object?: { sha?: string } }>(args.token, baseRefUrl, { method: 'GET' }).catch(
    () => null
  )) as { object?: { sha?: string } } | null
  const sha = baseRef?.object?.sha
  if (!sha || typeof sha !== 'string') return { error: `Could not resolve base branch "${args.base}" SHA.` }

  const createRefUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs`
  try {
    await githubFetch(args.token, createRefUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: `refs/heads/${args.branch}`, sha }),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // If already exists, proceed.
    if (!/Reference already exists/i.test(msg) && !/422/.test(msg)) return { error: msg }
  }
  return { ok: true }
}

async function upsertAnchorFile(args: {
  token: string
  repoFullName: string
  branch: string
  path: string
  content: string
  message: string
}): Promise<{ ok: true } | { error: string }> {
  const [owner, repo] = args.repoFullName.split('/')
  if (!owner || !repo) return { error: 'Invalid repo: expected owner/repo' }

  const apiPath = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeURIComponent(args.path)}`

  // If file exists on branch, include sha to update.
  let sha: string | undefined
  try {
    const existing = await githubFetch<{ sha?: string }>(args.token, `${apiPath}?ref=${encodeURIComponent(args.branch)}`, {
      method: 'GET',
    })
    if (existing?.sha && typeof existing.sha === 'string') sha = existing.sha
  } catch {
    // not found or inaccessible: treat as create
  }

  const body: any = {
    message: args.message,
    content: Buffer.from(args.content, 'utf8').toString('base64'),
    branch: args.branch,
    committer: { name: 'HAL', email: 'hal@localhost' },
  }
  if (sha) body.sha = sha

  try {
    await githubFetch(args.token, apiPath, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

async function createOrGetPr(args: {
  token: string
  repoFullName: string
  headBranch: string
  baseBranch: string
  title: string
  body: string
}): Promise<{ prUrl: string } | { error: string }> {
  const [owner, repo] = args.repoFullName.split('/')
  if (!owner || !repo) return { error: 'Invalid repo: expected owner/repo' }

  const pullsUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`
  try {
    const created = await githubFetch<{ html_url?: string }>(args.token, pullsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: args.title,
        head: args.headBranch,
        base: args.baseBranch,
        body: args.body,
        draft: true,
      }),
    })
    const prUrl = String(created?.html_url ?? '').trim()
    if (!prUrl) return { error: 'GitHub did not return a PR URL.' }
    return { prUrl }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // If PR already exists, fetch it.
    if (/pull request already exists/i.test(msg) || /A pull request already exists/i.test(msg) || /422/.test(msg)) {
      try {
        const listUrl = `${pullsUrl}?state=open&head=${encodeURIComponent(owner)}:${encodeURIComponent(args.headBranch)}`
        const list = await githubFetch<Array<{ html_url?: string }>>(args.token, listUrl, { method: 'GET' })
        const found = Array.isArray(list) ? list.find((p) => typeof p?.html_url === 'string' && p.html_url) : null
        const prUrl = String(found?.html_url ?? '').trim()
        if (prUrl) return { prUrl }
      } catch {
        // fall through
      }
    }
    return { error: msg }
  }
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
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
      defaultBranch?: string
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const ticketPk = typeof body.ticketPk === 'string' ? body.ticketPk.trim() : ''
    const ticketId = typeof body.ticketId === 'string' ? body.ticketId.trim() : ''
    const repoFullNameFromClient = typeof body.repoFullName === 'string' ? body.repoFullName.trim() : ''
    const configuredDefaultBranch = (typeof body.defaultBranch === 'string' ? body.defaultBranch.trim() : '') || 'main'

    if (!ticketPk && !ticketId) {
      json(res, 400, { success: false, error: 'ticketPk (preferred) or ticketId is required.' })
      return
    }

    const session = await getSession(req, res)
    const ghToken = session.github?.accessToken
    if (!ghToken) {
      json(res, 401, { success: false, error: 'Not authenticated with GitHub.' })
      return
    }

    const { supabaseUrl, supabaseKey } = parseSupabaseCredentialsWithServiceRole(body)
    if (!supabaseUrl || !supabaseKey) {
      json(res, 503, { success: false, error: 'Supabase server env is missing.' })
      return
    }
    const supabase = createClient(supabaseUrl, supabaseKey)

    const ticketQuery = supabase.from('tickets').select('pk, repo_full_name, ticket_number, display_id, title').limit(1)
    const { data: ticket, error: ticketErr } = ticketPk
      ? await ticketQuery.eq('pk', ticketPk).maybeSingle()
      : await ticketQuery.eq('id', ticketId).maybeSingle()
    if (ticketErr || !ticket?.pk) {
      json(res, 404, { success: false, error: 'Ticket not found.' })
      return
    }

    const resolvedTicketPk = String((ticket as any).pk)
    const ticketRepo = String((ticket as any).repo_full_name ?? '')
    const repoFullName = repoFullNameFromClient || ticketRepo
    if (ticketRepo && repoFullName && ticketRepo.toLowerCase() !== repoFullName.toLowerCase()) {
      json(res, 400, { success: false, error: `Repo mismatch. Ticket repo is ${ticketRepo}, request repo is ${repoFullName}.` })
      return
    }

    // If PR already exists (via any prior run/link), just return it.
    const { data: existing } = await supabase
      .from('hal_agent_runs')
      .select('pr_url, created_at')
      .eq('ticket_pk', resolvedTicketPk)
      .not('pr_url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
    const existingPrUrl = Array.isArray(existing) && existing.length ? (existing[0] as any)?.pr_url : null
    if (typeof existingPrUrl === 'string' && existingPrUrl.trim()) {
      json(res, 200, { success: true, prUrl: existingPrUrl.trim(), message: 'PR already linked.' })
      return
    }

    const defaultBranchResult = await getDefaultBranch(ghToken, repoFullName)
    const defaultBranch =
      'branch' in defaultBranchResult && defaultBranchResult.branch ? defaultBranchResult.branch : configuredDefaultBranch

    // If repo is empty, bootstrap a default branch commit so we can create refs/PRs.
    const branchesResult = await listBranches(ghToken, repoFullName)
    if ('branches' in branchesResult && branchesResult.branches.length === 0) {
      const bootstrap = await ensureInitialCommit(ghToken, repoFullName, defaultBranch)
      if ('error' in bootstrap) {
        json(res, 500, { success: false, error: `Initial commit failed: ${bootstrap.error}` })
        return
      }
    }

    const ticketNumber = (ticket as any).ticket_number as number | null | undefined
    const padded = padTicketNumber(ticketNumber)
    const displayId = String((ticket as any).display_id ?? padded)
    const branchName = `ticket/${padded}-implementation`

    const ensureBranch = await ensureBranchExists({
      token: ghToken,
      repoFullName,
      base: defaultBranch,
      branch: branchName,
    })
    if ('error' in ensureBranch) {
      json(res, 500, { success: false, error: ensureBranch.error })
      return
    }

    // Create a small anchor commit so GitHub accepts the PR (avoids "no commits between").
    const anchorRelPath = `.hal/pr-anchors/${safeFileSlug(displayId || padded)}.md`
    const now = new Date().toISOString()
    const anchorContent = [
      `# PR anchor for ${displayId || padded}`,
      '',
      'This file is an intentional placeholder to create a reviewable PR anchor for the ticket workflow.',
      'It can be removed later during implementation.',
      '',
      `Created at: ${now}`,
      '',
    ].join('\n')

    const upsert = await upsertAnchorFile({
      token: ghToken,
      repoFullName,
      branch: branchName,
      path: anchorRelPath,
      content: anchorContent,
      message: `chore(${padded}): create PR anchor`,
    })
    if ('error' in upsert) {
      json(res, 500, { success: false, error: upsert.error })
      return
    }

    const prTitle = `[${displayId || padded}] Implementation`
    const prBody = [
      `Ticket: **${displayId || padded}**`,
      '',
      'This PR was created automatically to satisfy the workflow requirement that tickets moved beyond To-do have a linked PR.',
      '',
      '- This PR is created as a **draft** and includes an initial “PR anchor” commit.',
      '- Implementation work should continue on this branch.',
      '',
    ].join('\n')

    const prResult = await createOrGetPr({
      token: ghToken,
      repoFullName,
      headBranch: branchName,
      baseBranch: defaultBranch,
      title: prTitle,
      body: prBody,
    })
    if ('error' in prResult) {
      json(res, 500, { success: false, error: prResult.error })
      return
    }

    const { error: insErr } = await supabase.from('hal_agent_runs').insert({
      agent_type: 'pr-create',
      repo_full_name: repoFullName,
      ticket_pk: resolvedTicketPk,
      ticket_number: ticketNumber ?? null,
      display_id: displayId || null,
      pr_url: prResult.prUrl,
      summary: `Created PR automatically: ${prResult.prUrl}`,
      status: 'finished',
      current_stage: 'completed',
    })
    if (insErr) {
      json(res, 500, { success: false, error: `Failed to record PR link: ${insErr.message}` })
      return
    }

    json(res, 200, { success: true, prUrl: prResult.prUrl, branchName })
  } catch (err) {
    json(res, 500, { success: false, error: err instanceof Error ? err.message : String(err) })
  }
}

