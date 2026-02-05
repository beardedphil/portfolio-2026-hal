import type { IncomingMessage, ServerResponse } from 'http'
import { appendProgress, getCursorApiKey, getServerSupabase, humanReadableCursorError, type AgentType } from './_shared.ts'

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = []
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return {}
  return JSON.parse(raw) as unknown
}

function json(res: ServerResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') {
    res.statusCode = 405
    res.end('Method Not Allowed')
    return
  }

  try {
    const body = (await readJsonBody(req)) as {
      agentType?: AgentType
      repoFullName?: string
      ticketNumber?: number
      // For QA: optionally provide branch hint (still read from ticket body if present)
      message?: string
    }

    const agentType = body.agentType === 'qa' ? 'qa' : 'implementation'
    const repoFullName = typeof body.repoFullName === 'string' ? body.repoFullName.trim() : ''
    const ticketNumber = typeof body.ticketNumber === 'number' ? body.ticketNumber : null
    if (!repoFullName || !ticketNumber || !Number.isFinite(ticketNumber)) {
      json(res, 400, { error: 'agentType, repoFullName, and ticketNumber are required.' })
      return
    }

    const cursorKey = getCursorApiKey()
    const auth = Buffer.from(`${cursorKey}:`).toString('base64')
    const repoUrl = `https://github.com/${repoFullName}`
    const supabase = getServerSupabase()

    // Fetch ticket (repo-scoped 0079)
    const { data: ticket, error: ticketErr } = await supabase
      .from('tickets')
      .select('pk, repo_full_name, ticket_number, display_id, body_md, kanban_column_id')
      .eq('repo_full_name', repoFullName)
      .eq('ticket_number', ticketNumber)
      .maybeSingle()
    if (ticketErr || !ticket?.pk) {
      json(res, 404, { error: `Ticket ${ticketNumber} not found for repo ${repoFullName}.` })
      return
    }

    const ticketPk = ticket.pk as string
    const displayId = (ticket as any).display_id ?? String(ticketNumber).padStart(4, '0')
    const bodyMd = String((ticket as any).body_md ?? '')

    // Build prompt
    const goalMatch = bodyMd.match(/##\s*Goal[^\n]*\n([\s\S]*?)(?=\n##|$)/i)
    const deliverableMatch = bodyMd.match(/##\s*Human-verifiable deliverable[^\n]*\n([\s\S]*?)(?=\n##|$)/i)
    const criteriaMatch = bodyMd.match(/##\s*Acceptance criteria[^\n]*\n([\s\S]*?)(?=\n##|$)/i)
    const goal = (goalMatch?.[1] ?? '').trim()
    const deliverable = (deliverableMatch?.[1] ?? '').trim()
    const criteria = (criteriaMatch?.[1] ?? '').trim()

    const promptText =
      agentType === 'implementation'
        ? [
            'Implement this ticket.',
            '',
            '## Ticket',
            `**ID**: ${displayId}`,
            `**Repo**: ${repoFullName}`,
            '',
            '## Goal',
            goal || '(not specified)',
            '',
            '## Human-verifiable deliverable',
            deliverable || '(not specified)',
            '',
            '## Acceptance criteria',
            criteria || '(not specified)',
          ].join('\n')
        : [
            'QA this ticket implementation. Review the code, generate a QA report, and complete the QA workflow.',
            '',
            '## Ticket',
            `**ID**: ${displayId}`,
            `**Repo**: ${repoFullName}`,
            '',
            '## Goal',
            goal || '(not specified)',
            '',
            '## Human-verifiable deliverable',
            deliverable || '(not specified)',
            '',
            '## Acceptance criteria',
            criteria || '(not specified)',
          ].join('\n')

    // Create run row
    const initialProgress = appendProgress([], `Launching ${agentType} run for ${displayId}`)
    const { data: runRow, error: runInsErr } = await supabase
      .from('hal_agent_runs')
      .insert({
        agent_type: agentType,
        repo_full_name: repoFullName,
        ticket_pk: ticketPk,
        ticket_number: ticketNumber,
        display_id: displayId,
        status: 'launching',
        progress: initialProgress,
      })
      .select('run_id')
      .maybeSingle()

    if (runInsErr || !runRow?.run_id) {
      json(res, 500, { error: `Failed to create run row: ${runInsErr?.message ?? 'unknown'}` })
      return
    }

    const runId = runRow.run_id as string

    // Launch Cursor agent
    const branchName =
      agentType === 'implementation'
        ? `ticket/${String(ticketNumber).padStart(4, '0')}-implementation`
        : 'main'
    const target =
      agentType === 'implementation'
        ? { autoCreatePr: true, branchName }
        : { branchName: 'main' }

    const launchRes = await fetch('https://api.cursor.com/v0/agents', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: { text: promptText },
        source: { repository: repoUrl, ref: 'main' },
        target,
      }),
    })

    const launchText = await launchRes.text()
    if (!launchRes.ok) {
      const msg = humanReadableCursorError(launchRes.status, launchText)
      await supabase
        .from('hal_agent_runs')
        .update({
          status: 'failed',
          error: msg,
          progress: appendProgress(initialProgress, `Launch failed: ${msg}`),
          finished_at: new Date().toISOString(),
        })
        .eq('run_id', runId)
      json(res, 200, { runId, status: 'failed', error: msg })
      return
    }

    let launchData: { id?: string; status?: string }
    try {
      launchData = JSON.parse(launchText) as typeof launchData
    } catch {
      const msg = 'Invalid response from Cursor API when launching agent.'
      await supabase
        .from('hal_agent_runs')
        .update({
          status: 'failed',
          error: msg,
          progress: appendProgress(initialProgress, msg),
          finished_at: new Date().toISOString(),
        })
        .eq('run_id', runId)
      json(res, 200, { runId, status: 'failed', error: msg })
      return
    }

    const cursorAgentId = launchData.id
    const cursorStatus = launchData.status ?? 'CREATING'
    if (!cursorAgentId) {
      const msg = 'Cursor API did not return an agent ID.'
      await supabase
        .from('hal_agent_runs')
        .update({
          status: 'failed',
          error: msg,
          progress: appendProgress(initialProgress, msg),
          finished_at: new Date().toISOString(),
        })
        .eq('run_id', runId)
      json(res, 200, { runId, status: 'failed', error: msg })
      return
    }

    await supabase
      .from('hal_agent_runs')
      .update({
        status: 'polling',
        cursor_agent_id: cursorAgentId,
        cursor_status: cursorStatus,
        progress: appendProgress(initialProgress, `Launched Cursor agent (${cursorStatus}).`),
      })
      .eq('run_id', runId)

    json(res, 200, { runId, status: 'polling', cursorAgentId })
  } catch (err) {
    json(res, 500, { error: err instanceof Error ? err.message : String(err) })
  }
}

