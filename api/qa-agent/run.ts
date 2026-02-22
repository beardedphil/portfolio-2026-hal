import type { IncomingMessage, ServerResponse } from 'http'
import fs from 'fs'
import path from 'path'
import {
  humanReadableCursorError,
  readJsonBody,
  parseTicketId,
  extractBranchInfo,
  parseTicketBodySections,
  buildPromptText,
} from './run-helpers.js'

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') {
    res.statusCode = 405
    res.end('Method Not Allowed')
    return
  }

  const writeStage = (stage: object) => {
    res.write(JSON.stringify(stage) + '\n')
  }

  try {
    const body = (await readJsonBody(req)) as {
      message?: string
      supabaseUrl?: string
      supabaseAnonKey?: string
      repoFullName?: string
      /** Optional Cursor Cloud Agent model (e.g. "claude-4-sonnet", "gpt-5.2"). Omit for auto-selection. */
      model?: string
    }

    const message = typeof body.message === 'string' ? body.message.trim() : ''
    const model =
      (typeof body.model === 'string' ? body.model.trim() : '') ||
      process.env.CURSOR_QA_MODEL ||
      process.env.CURSOR_AGENT_MODEL ||
      ''
    const supabaseUrl = typeof body.supabaseUrl === 'string' ? body.supabaseUrl.trim() || undefined : undefined
    const supabaseAnonKey = typeof body.supabaseAnonKey === 'string' ? body.supabaseAnonKey.trim() || undefined : undefined
    const repoFullName = typeof body.repoFullName === 'string' ? body.repoFullName.trim() || undefined : undefined

    const key = (process.env.CURSOR_API_KEY || process.env.VITE_CURSOR_API_KEY || '').trim()
    if (!key) {
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/x-ndjson')
      writeStage({ stage: 'failed', error: 'Cursor API is not configured. Set CURSOR_API_KEY in env.', status: 'not-configured' })
      res.end()
      return
    }

    // Parse "QA ticket XXXX"
    const ticketId = parseTicketId(message)
    if (!ticketId) {
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/x-ndjson')
      writeStage({ stage: 'failed', error: 'Say "QA ticket XXXX" (e.g. QA ticket 0046) to QA a ticket.', status: 'invalid-input' })
      res.end()
      return
    }

    if (!supabaseUrl || !supabaseAnonKey) {
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/x-ndjson')
      writeStage({ stage: 'failed', error: `Supabase not configured. Connect project to fetch ticket ${ticketId} from Supabase.`, status: 'ticket-not-found' })
      res.end()
      return
    }

    if (!repoFullName) {
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/x-ndjson')
      writeStage({ stage: 'failed', error: 'No GitHub repo connected. Use "Connect GitHub Repo" first.', status: 'no-repo' })
      res.end()
      return
    }

    res.statusCode = 200
    res.setHeader('Content-Type', 'application/x-ndjson')
    res.flushHeaders?.()

    const auth = Buffer.from(`${key}:`).toString('base64')
    const repoUrl = `https://github.com/${repoFullName}`

    writeStage({ stage: 'fetching_ticket' })
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(supabaseUrl, supabaseAnonKey)
    const ticketNumber = parseInt(ticketId, 10)
    const { data: row, error } = await supabase
      .from('tickets')
      .select('pk, body_md, display_id')
      .eq('repo_full_name', repoFullName)
      .eq('ticket_number', ticketNumber)
      .maybeSingle()

    if (error || !row?.body_md || !row?.pk) {
      writeStage({ stage: 'failed', error: `Ticket ${ticketId} not found in Supabase for repo ${repoFullName}.`, status: 'ticket-not-found' })
      res.end()
      return
    }

    const ticketPk = (row as any).pk as string
    const displayId = (row as any).display_id ?? ticketId
    const bodyMd = String((row as any).body_md ?? '')

    writeStage({ stage: 'fetching_branch' })
    const { branchName, refForApi } = extractBranchInfo(bodyMd, ticketId)
    const { goal, deliverable, criteria } = parseTicketBodySections(bodyMd)

    // Read QA ruleset (best-effort)
    const repoRoot = process.cwd()
    const qaRulesPath = path.join(repoRoot, '.cursor', 'rules', 'qa-audit-report.mdc')
    let qaRules = ''
    try {
      qaRules = fs.readFileSync(qaRulesPath, 'utf8')
    } catch {
      qaRules = '# QA Audit Report\n\nWhen you QA a ticket, you must add a QA report to the ticket audit folder.'
    }

    const verifyFromMainNote =
      refForApi === 'main'
        ? '\n**Verify from:** `main` (implementation was merged to main for QA access). Do NOT attempt to check out or use the feature branch; use the latest `main` only.\n'
        : ''

    // Determine HAL API URL (use environment variable or default to localhost)
    const halApiUrl = process.env.HAL_API_URL || process.env.APP_ORIGIN || 'http://localhost:5173'

    const promptText = buildPromptText({
      repoFullName,
      ticketId,
      displayId,
      branchName,
      refForApi,
      halApiUrl,
      goal,
      deliverable,
      criteria,
      qaRules,
      verifyFromMainNote,
    })

    writeStage({ stage: 'launching' })
    const launchRes = await fetch('https://api.cursor.com/v0/agents', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: { text: promptText },
        source: { repository: repoUrl, ref: refForApi },
        target: { branchName: 'main' },
        ...(model ? { model } : {}),
      }),
    })

    const launchText = await launchRes.text()
    if (!launchRes.ok) {
      writeStage({ stage: 'failed', error: humanReadableCursorError(launchRes.status, launchText), status: 'launch-failed' })
      res.end()
      return
    }

    let launchData: { id?: string; status?: string }
    try {
      launchData = JSON.parse(launchText) as typeof launchData
    } catch {
      writeStage({ stage: 'failed', error: 'Invalid response from Cursor API when launching agent.', status: 'launch-failed' })
      res.end()
      return
    }

    const agentId = launchData.id
    if (!agentId) {
      writeStage({ stage: 'failed', error: 'Cursor API did not return an agent ID.', status: 'launch-failed' })
      res.end()
      return
    }

    const pollInterval = 4000
    let lastStatus = launchData.status ?? 'CREATING'
    writeStage({ stage: 'polling', cursorStatus: lastStatus })

    const deadline = Date.now() + 55_000
    while (Date.now() < deadline) {
      await sleep(pollInterval)
      const statusRes = await fetch(`https://api.cursor.com/v0/agents/${agentId}`, {
        method: 'GET',
        headers: { Authorization: `Basic ${auth}` },
      })
      const statusText = await statusRes.text()
      if (!statusRes.ok) {
        writeStage({ stage: 'failed', error: humanReadableCursorError(statusRes.status, statusText), status: 'poll-failed' })
        res.end()
        return
      }
      let statusData: { status?: string; summary?: string }
      try {
        statusData = JSON.parse(statusText) as typeof statusData
      } catch {
        writeStage({ stage: 'failed', error: 'Invalid response when polling agent status.', status: 'poll-failed' })
        res.end()
        return
      }
      lastStatus = statusData.status ?? lastStatus
      writeStage({ stage: 'polling', cursorStatus: lastStatus })

      if (lastStatus === 'FINISHED') {
        const summary = statusData.summary ?? 'QA completed.'
        // On PASS, we’d normally move ticket to Human-in-the-loop. Cursor agent decides; serverless just reports.
        writeStage({ stage: 'completed', success: true, content: summary, status: 'completed' })
        res.end()
        return
      }
      if (lastStatus === 'FAILED' || lastStatus === 'CANCELLED' || lastStatus === 'ERROR') {
        const errMsg = statusData.summary ?? `Agent ended with status ${lastStatus}.`
        writeStage({ stage: 'failed', error: errMsg, status: lastStatus.toLowerCase() })
        res.end()
        return
      }
    }

    writeStage({
      stage: 'failed',
      error: 'QA run is taking longer than this request can hold open. (Next step: switch to launch-and-poll serverless design.)',
      status: 'timeout',
    })
    res.end()
  } catch (err) {
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/x-ndjson')
    writeStage({ stage: 'failed', error: (err instanceof Error ? err.message : String(err)).replace(/\n/g, ' ').slice(0, 500), status: 'error' })
    res.end()
  }
}

