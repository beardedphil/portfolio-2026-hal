import type { IncomingMessage, ServerResponse } from 'http'

function humanReadableCursorError(status: number, detail?: string): string {
  if (status === 401) return 'Cursor API authentication failed. Check that CURSOR_API_KEY is valid.'
  if (status === 403) return 'Cursor API access denied. Your plan may not include Cloud Agents API.'
  if (status === 429) return 'Cursor API rate limit exceeded. Please try again in a moment.'
  if (status >= 500) return `Cursor API server error (${status}). Please try again later.`
  const suffix = detail ? ` — ${String(detail).slice(0, 100)}` : ''
  return `Cursor API request failed (${status})${suffix}`
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return {}
  return JSON.parse(raw) as unknown
}

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
    }

    const message = typeof body.message === 'string' ? body.message.trim() : ''
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

    // Parse "Implement ticket XXXX"
    const ticketIdMatch = message.match(/implement\s+ticket\s+(\d{4})/i)
    const ticketId = ticketIdMatch ? ticketIdMatch[1] : null
    if (!ticketId) {
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/x-ndjson')
      writeStage({ stage: 'failed', error: 'Say "Implement ticket XXXX" (e.g. Implement ticket 0046) to implement a ticket.', status: 'invalid-input' })
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

    // Fetch ticket (repo-scoped 0079)
    writeStage({ stage: 'fetching_ticket' })
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(supabaseUrl, supabaseAnonKey)
    const ticketNumber = parseInt(ticketId, 10)
    const { data: row, error } = await supabase
      .from('tickets')
      .select('pk, body_md, display_id, kanban_column_id')
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
    const currentColumnId = (row as any).kanban_column_id ?? null

    // Move ticket To Do -> Doing when starting (0053)
    if (currentColumnId === 'col-todo') {
      try {
        const { data: inColumn, error: fetchErr } = await supabase
          .from('tickets')
          .select('kanban_position')
          .eq('repo_full_name', repoFullName)
          .eq('kanban_column_id', 'col-doing')
          .order('kanban_position', { ascending: false })
          .limit(1)
        if (fetchErr) throw fetchErr
        const nextPosition = inColumn?.length ? ((inColumn[0] as any)?.kanban_position ?? -1) + 1 : 0
        const movedAt = new Date().toISOString()
        const { error: updateErr } = await supabase
          .from('tickets')
          .update({ kanban_column_id: 'col-doing', kanban_position: nextPosition, kanban_moved_at: movedAt })
          .eq('pk', ticketPk)
        if (updateErr) throw updateErr
      } catch (moveErr) {
        const msg = moveErr instanceof Error ? moveErr.message : String(moveErr)
        writeStage({ stage: 'failed', error: `Failed to move ticket to Doing: ${msg}. The ticket remains in To Do.`, status: 'move-to-doing-failed' })
        res.end()
        return
      }
    }

    // Build prompt
    const goalMatch = bodyMd.match(/##\s*Goal\s*\([^)]*\)\s*\n([\s\S]*?)(?=\n##|$)/i)
    const deliverableMatch = bodyMd.match(/##\s*Human-verifiable deliverable[^\n]*\n([\s\S]*?)(?=\n##|$)/i)
    const criteriaMatch = bodyMd.match(/##\s*Acceptance criteria[^\n]*\n([\s\S]*?)(?=\n##|$)/i)
    const goal = (goalMatch?.[1] ?? '').trim()
    const deliverable = (deliverableMatch?.[1] ?? '').trim()
    const criteria = (criteriaMatch?.[1] ?? '').trim()
    
    // Check if ticket is back in To Do (might indicate previous failure)
    const isBackInTodo = currentColumnId === 'col-todo'
    
    // Determine HAL API URL (use environment variable or default to localhost)
    const halApiUrl = process.env.HAL_API_URL || process.env.APP_ORIGIN || 'http://localhost:5173'
    
    const promptText = [
      'Implement this ticket.',
      '',
      '## Ticket',
      `**ID**: ${displayId}`,
      `**Repo**: ${repoFullName}`,
      `**Current Column**: ${currentColumnId || 'col-unassigned'}`,
      `**HAL API Base URL**: ${halApiUrl}`,
      '',
      '## Goal',
      goal || '(not specified)',
      '',
      '## Human-verifiable deliverable',
      deliverable || '(not specified)',
      '',
      '## Acceptance criteria',
      criteria || '(not specified)',
      '',
      '## Full Ticket Body',
      '```',
      bodyMd,
      '```',
      '',
      '## IMPORTANT: Read Failure Notes Before Starting',
      '',
      '**BEFORE you start implementing, you MUST:**',
      '',
      '1. **Read the full ticket body above** - Look for any failure notes, QA feedback, or comments that explain why this ticket was previously failed or moved back to To Do.',
      '',
      '2. **Check for QA artifacts** - Call the HAL API to fetch all artifacts for this ticket. Look for QA reports (agent_type: "qa") that may contain failure reasons or feedback.',
      '',
      '3. **Address any failure reasons** - If the ticket was previously failed, you MUST read and address the specific issues mentioned in QA reports or ticket notes. Do NOT simply re-implement the same solution.',
      '',
      isBackInTodo ? '**⚠️ This ticket is back in To Do - it may have been moved back after a failure. Check for QA reports and failure notes before starting.**' : '',
      '',
      '## MANDATORY: Store All Required Artifacts',
      '',
      '**YOU MUST store ALL 6 required artifacts before marking the ticket ready for QA. This is MANDATORY, not optional.**',
      '',
      '**CRITICAL: Artifacts must contain SUBSTANTIVE CONTENT, not just titles or placeholders.**',
      '',
      '**Artifact content requirements:**',
      '- Each artifact body_md must contain at least 30-50 characters of substantive content beyond the title',
      '- Artifacts cannot be empty, contain only headings, or consist of placeholder text (TODO, TBD, etc.)',
      '- The HAL API will REJECT artifacts that are essentially blank or placeholder-only',
      '- If you attempt to store an artifact with insufficient content, you will receive a clear error message explaining what is missing',
      '- Re-running Implementation on the same ticket will NOT overwrite existing artifacts with empty content',
      '',
      '**Required artifacts (call HAL API `/api/artifacts/insert-implementation` for each):**',
      '',
      '1. **Plan** (`artifactType: "plan"`, title: `Plan for ticket ${displayId}`)',
      '   - Must include: 3-10 bullets describing your intended approach, file touchpoints, and implementation strategy',
      '',
      '2. **Worklog** (`artifactType: "worklog"`, title: `Worklog for ticket ${displayId}`)',
      '   - Must include: Timestamped notes of what was done, in order, with specific details about changes made',
      '',
      '3. **Changed Files** (`artifactType: "changed-files"`, title: `Changed Files for ticket ${displayId}`)',
      '   - Must include: List of files created/modified/deleted with 1-2 line purpose for each',
      '',
      '4. **Decisions** (`artifactType: "decisions"`, title: `Decisions for ticket ${displayId}`)',
      '   - Must include: Any trade-offs, assumptions, and why they were made. If no decisions were needed, state that explicitly.',
      '',
      '5. **Verification** (`artifactType: "verification"`, title: `Verification for ticket ${displayId}`)',
      '   - Must include: QA verification steps, code review notes, automated checks (build, lint), and how to verify the change works',
      '',
      '6. **PM Review** (`artifactType: "pm-review"`, title: `PM Review for ticket ${displayId}`)',
      '   - Must include: Likelihood of success (0-100%), potential failures, and how to diagnose them using in-app diagnostics',
      '',
      '7. **Git diff** (`artifactType: "git-diff"`, title: `Git diff for ticket ${displayId}`)',
      '   - Must include: Full unified git diff of all changes for this ticket',
      '   - Generate using: `git diff main...HEAD` (or `git diff main` if on feature branch) to get all changes',
      '   - If no changes exist or diff is empty, include a message explaining why (e.g., "No changes detected" or "All changes already merged")',
      '   - The diff should be in unified diff format and will be displayed with syntax highlighting in the UI',
      '',
      '**Failure to store all required artifacts with substantive content will cause QA to fail immediately.**',
      '',
      '**If artifact storage fails with a validation error:**',
      '- Read the error message carefully - it will explain what content is missing',
      '- Add the required substantive content to your artifact body_md',
      '- Retry the artifact storage API call',
      '- Do NOT proceed to mark the ticket ready until all artifacts are successfully stored',
      '',
      '## HAL API Contract',
      '',
      '**IMPORTANT:** All Supabase operations (storing artifacts, updating tickets, moving tickets) must be done by calling the HAL API directly using `fetch()`. Read `.hal/api-base-url` to get the HAL base URL.',
      '',
      '**HAL API Base URL:**',
      '',
      `\`${halApiUrl}\``,
      '',
      '**Note:** You can also read `.hal/api-base-url` from the repo if needed, but the base URL is provided above.',
      '',
      '**Available HAL API endpoints:**',
      '',
      '1. **`POST /api/artifacts/insert-implementation`** - Store implementation artifact (MANDATORY - store all 7 required artifacts)',
      '   - Body: `{ ticketId: string, artifactType: string, title: string, body_md: string }`',
      '   - Artifact types: `"plan"`, `"worklog"`, `"changed-files"`, `"decisions"`, `"verification"`, `"pm-review"`, `"git-diff"`',
      '   - **MANDATORY:** Store ALL 7 required artifacts before marking ticket ready for QA',
      '',
      '2. **`POST /api/agent-tools/execute`** - Fetch all artifacts for a ticket (use to check for QA reports and failure notes)',
      '   - Body: `{ tool: "get_artifacts", params: { ticketId: string } }`',
      '   - Returns: `{ success: boolean, artifacts?: Array<{agent_type, title, body_md, ...}> }`',
      '   - **Use this BEFORE starting implementation to check for previous failures**',
      '',
      '3. **`POST /api/tickets/get`** - Fetch ticket content',
      '   - Body: `{ ticketId: string }`',
      '   - Returns: `{ success: boolean, body_md?: string }`',
      '',
      '4. **`POST /api/tickets/update`** - Update ticket body',
      '   - Body: `{ ticketId: string, body_md: string }`',
      '   - Use to add branch name, merge notes, etc.',
      '',
      '5. **`POST /api/tickets/move`** - Move ticket to different column',
      '   - Body: `{ ticketId: string, columnId: string }`',
      '',
      '**Example workflow:**',
      '',
      '```javascript',
      '// 1. Get HAL API base URL',
      'const baseUrl = (await readFile(\'.hal/api-base-url\', \'utf8\')).trim()',
      '',
      '// 2. Check for previous failures (QA reports)',
      'const artifactsRes = await fetch(`${baseUrl}/api/agent-tools/execute`, {',
      '  method: \'POST\',',
      '  headers: { \'Content-Type\': \'application/json\' },',
      '  body: JSON.stringify({',
      '    tool: \'get_artifacts\',',
      '    params: { ticketId: \'0076\' }',
      '  })',
      '})',
      'const artifactsData = await artifactsRes.json()',
      'if (artifactsData.success && artifactsData.artifacts) {',
      '  // Look for QA reports (agent_type: "qa")',
      '  const qaReports = artifactsData.artifacts.filter(a => a.agent_type === \'qa\')',
      '  // Read and address any failure reasons',
      '}',
      '',
      '// 3. Store your plan artifact',
      'const planRes = await fetch(`${baseUrl}/api/artifacts/insert-implementation`, {',
      '  method: \'POST\',',
      '  headers: { \'Content-Type\': \'application/json\' },',
      '  body: JSON.stringify({',
      '    ticketId: \'0076\',',
      '    artifactType: \'plan\',',
      '    title: \'Plan for ticket 0076\',',
      '    body_md: \'# Plan\\n\\n...\'',
      '  })',
      '})',
      'const planData = await planRes.json()',
      'if (!planData.success) throw new Error(planData.error)',
      '',
      '// 4. Continue storing all 6 required artifacts as you work...',
      '```',
      '',
      '**No credentials needed** - The HAL server uses its own Supabase credentials. Just call the API endpoints directly.',
    ].filter(Boolean).join('\n')

    writeStage({ stage: 'resolving_repo' })
    writeStage({ stage: 'launching' })

    const launchRes = await fetch('https://api.cursor.com/v0/agents', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: { text: promptText },
        source: { repository: repoUrl, ref: 'main' },
        target: { autoCreatePr: true, branchName: `ticket/${ticketId}-implementation` },
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

    // Poll for up to ~55s to fit common serverless limits
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

      let statusData: { status?: string; summary?: string; target?: { prUrl?: string } }
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
        const summary = statusData.summary ?? 'Implementation completed.'
        const prUrl = statusData.target?.prUrl

        // Move ticket to QA
        try {
          const { data: inColumn } = await supabase
            .from('tickets')
            .select('kanban_position')
            .eq('repo_full_name', repoFullName)
            .eq('kanban_column_id', 'col-qa')
            .order('kanban_position', { ascending: false })
            .limit(1)
          const nextPosition = inColumn?.length ? ((inColumn[0] as any)?.kanban_position ?? -1) + 1 : 0
          const movedAt = new Date().toISOString()
          await supabase
            .from('tickets')
            .update({ kanban_column_id: 'col-qa', kanban_position: nextPosition, kanban_moved_at: movedAt })
            .eq('pk', ticketPk)
        } catch {
          // non-fatal: still return completion summary
        }

        const parts = [summary]
        if (prUrl) parts.push(`\n\nPull request: ${prUrl}`)
        parts.push(`\n\nTicket ${displayId} moved to QA.`)
        writeStage({ stage: 'completed', success: true, content: parts.join(''), prUrl, summary, status: 'completed' })
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
      error: 'Implementation run is taking longer than this request can hold open. (Next step: switch to launch-and-poll serverless design.)',
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

