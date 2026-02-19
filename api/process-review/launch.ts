import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import { getServerSupabase, getCursorApiKey, humanReadableCursorError, appendProgress } from '../agent-runs/_shared.js'

const PROCESS_REVIEW_CURSOR_MODEL = 'gpt-5.2'

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

/**
 * Launch a Cursor Cloud Agent for Process Review (gpt-5.2).
 * Fetches ticket + artifacts, builds prompt, launches agent. Frontend polls
 * /api/agent-runs/status?runId=... ; when finished, status response includes
 * suggestions (parsed from Cursor conversation in status handler).
 */
export default async function handler(req: IncomingMessage, res: ServerResponse) {
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
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const ticketPk = typeof body.ticketPk === 'string' ? body.ticketPk.trim() : undefined
    const ticketId = typeof body.ticketId === 'string' ? body.ticketId.trim() : undefined
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

    if ((!ticketPk && !ticketId) || !supabaseUrl || !supabaseAnonKey) {
      json(res, 400, {
        success: false,
        error: 'ticketPk (preferred) or ticketId, and Supabase credentials are required.',
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    const ticketQuery = ticketPk
      ? await supabase.from('tickets').select('pk, id, display_id, title, body_md, repo_full_name').eq('pk', ticketPk).maybeSingle()
      : await supabase.from('tickets').select('pk, id, display_id, title, body_md, repo_full_name').eq('id', ticketId!).maybeSingle()

    if (ticketQuery.error || !ticketQuery.data) {
      json(res, 200, { success: false, error: `Ticket not found: ${ticketQuery.error?.message || 'Unknown error'}` })
      return
    }

    const ticket = ticketQuery.data as { pk: string; id: number; display_id?: string; title?: string; body_md?: string; repo_full_name: string }

    // Fetch latest valid RED for this ticket (HAL-0760: RED-driven orchestration)
    const { data: redData, error: redError } = await supabase.rpc('get_latest_valid_red', {
      p_repo_full_name: ticket.repo_full_name,
      p_ticket_pk: ticket.pk,
    })

    if (redError) {
      json(res, 200, {
        success: false,
        error: `Failed to fetch RED: ${redError.message}. Context Bundle generation requires a valid RED document.`,
      })
      return
    }

    if (!redData || redData.length === 0) {
      json(res, 200, {
        success: false,
        error: `No valid RED found for ticket ${ticket.display_id || ticket.id}. Context Bundle generation requires a valid RED document. To generate a RED, use the RED section in the ticket details view or call POST /api/red/insert with the structured requirements.`,
      })
      return
    }

    const redDocument = redData[0] as {
      red_id: string
      version: number
      validation_status: string
    }

    const redId = redDocument.red_id
    const redVersion = redDocument.version

    const { data: artifacts, error: artifactsError } = await supabase
      .from('agent_artifacts')
      .select('artifact_id, ticket_pk, agent_type, title, body_md, created_at')
      .eq('ticket_pk', ticket.pk)
      .order('created_at', { ascending: false })

    if (artifactsError) {
      json(res, 200, { success: false, error: `Failed to fetch artifacts: ${artifactsError.message}` })
      return
    }

    if (!artifacts || artifacts.length === 0) {
      json(res, 200, {
        success: false,
        error: 'No artifacts found for this ticket. Process review requires artifacts to analyze.',
      })
      return
    }

    const artifactSummaries = artifacts
      .map((a: { title?: string; agent_type?: string; body_md?: string }) => {
        const bodyPreview = (a.body_md || '').slice(0, 500)
        return `- ${a.title || a.agent_type} (${a.agent_type}): ${bodyPreview}${bodyPreview.length >= 500 ? '...' : ''}`
      })
      .join('\n')

    const promptText = `You are a process review agent analyzing ticket artifacts to suggest improvements to agent instructions.

Ticket: ${ticket.display_id || ticket.id} — ${ticket.title}

Artifacts found:
${artifactSummaries}

Review the artifacts above and suggest specific, actionable improvements to agent instructions (rules, templates, or process documentation) that would help prevent issues or improve outcomes for similar tickets in the future.

Your final response MUST be a valid JSON array of objects, each with "text" and "justification" fields. Put nothing else after the JSON array.
- "text": The suggestion (specific and actionable)
- "justification": Short explanation (1-2 sentences)

Example:
[
  {"text": "Add a rule requiring agents to verify file paths exist before reading", "justification": "Prevents file-not-found errors."},
  {"text": "Update ticket template to include Dependencies section", "justification": "Helps agents understand prerequisites."}
]

Provide 3-5 suggestions. If no meaningful improvements, return [].`

    const cursorKey = getCursorApiKey()
    const auth = Buffer.from(`${cursorKey}:`).toString('base64')
    const repoUrl = `https://github.com/${ticket.repo_full_name}`
    const serverSupabase = getServerSupabase()

    const displayId = ticket.display_id ?? String(ticket.id).padStart(4, '0')
    const initialProgress = appendProgress([], `Launching Process Review agent for ticket ${displayId}`)
    // Store RED identifier (HAL-0760: track which RED version was used)
    const { data: runRow, error: runInsErr } = await serverSupabase
      .from('hal_agent_runs')
      .insert({
        agent_type: 'process-review',
        repo_full_name: ticket.repo_full_name,
        ticket_pk: ticket.pk,
        ticket_number: typeof ticket.id === 'number' ? ticket.id : null,
        display_id: displayId,
        status: 'launching',
        progress: initialProgress,
        red_id: redId,
        red_version: redVersion,
      })
      .select('run_id')
      .maybeSingle()

    if (runInsErr || !runRow?.run_id) {
      json(res, 500, { success: false, error: `Failed to create run: ${runInsErr?.message ?? 'unknown'}` })
      return
    }

    const runId = runRow.run_id as string

    const launchRes = await fetch('https://api.cursor.com/v0/agents', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: { text: promptText },
        source: { repository: repoUrl, ref: 'main' },
        target: { branchName: 'main' },
        model: PROCESS_REVIEW_CURSOR_MODEL,
      }),
    })

    const launchText = await launchRes.text()
    if (!launchRes.ok) {
      const msg = humanReadableCursorError(launchRes.status, launchText)
      await serverSupabase
        .from('hal_agent_runs')
        .update({
          status: 'failed',
          error: msg,
          progress: appendProgress(initialProgress, `Launch failed: ${msg}`),
          finished_at: new Date().toISOString(),
        })
        .eq('run_id', runId)
      json(res, 200, { success: false, runId, status: 'failed', error: msg })
      return
    }

    let launchData: { id?: string; status?: string }
    try {
      launchData = JSON.parse(launchText) as typeof launchData
    } catch {
      const msg = 'Invalid response from Cursor API.'
      await serverSupabase
        .from('hal_agent_runs')
        .update({
          status: 'failed',
          error: msg,
          progress: appendProgress(initialProgress, msg),
          finished_at: new Date().toISOString(),
        })
        .eq('run_id', runId)
      json(res, 200, { success: false, runId, status: 'failed', error: msg })
      return
    }

    const cursorAgentId = launchData.id
    const cursorStatus = launchData.status ?? 'CREATING'
    if (!cursorAgentId) {
      const msg = 'Cursor API did not return an agent ID.'
      await serverSupabase
        .from('hal_agent_runs')
        .update({
          status: 'failed',
          error: msg,
          progress: appendProgress(initialProgress, msg),
          finished_at: new Date().toISOString(),
        })
        .eq('run_id', runId)
      json(res, 200, { success: false, runId, status: 'failed', error: msg })
      return
    }

    const progressAfterLaunch = appendProgress(initialProgress, `Launched Cursor agent (${cursorStatus}).`)
    await serverSupabase
      .from('hal_agent_runs')
      .update({
        status: 'polling',
        cursor_agent_id: cursorAgentId,
        cursor_status: cursorStatus,
        progress: progressAfterLaunch,
      })
      .eq('run_id', runId)

    json(res, 200, { success: true, runId, status: 'polling', cursorAgentId })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[process-review/launch] Error:', message)
    json(res, 500, { success: false, error: message })
  }
}
