import type { SupabaseClient } from '@supabase/supabase-js'

export type AgentType = 'implementation' | 'qa' | 'project-manager' | 'process-review'

export interface TicketBodySections {
  goal: string
  deliverable: string
  criteria: string
}

/**
 * Extracts goal, deliverable, and criteria sections from ticket body markdown.
 */
export function parseTicketBodySections(bodyMd: string): TicketBodySections {
  const goalMatch = bodyMd.match(/##\s*Goal[^\n]*\n([\s\S]*?)(?=\n##|$)/i)
  const deliverableMatch = bodyMd.match(/##\s*Human-verifiable deliverable[^\n]*\n([\s\S]*?)(?=\n##|$)/i)
  const criteriaMatch = bodyMd.match(/##\s*Acceptance criteria[^\n]*\n([\s\S]*?)(?=\n##|$)/i)
  return {
    goal: (goalMatch?.[1] ?? '').trim(),
    deliverable: (deliverableMatch?.[1] ?? '').trim(),
    criteria: (criteriaMatch?.[1] ?? '').trim(),
  }
}

export interface PromptParams {
  repoFullName: string
  ticketNumber: number
  displayId: string
  currentColumnId: string | null
  defaultBranch: string
  halApiBaseUrl: string
  goal: string
  deliverable: string
  criteria: string
  existingPrUrl?: string | null
}

/**
 * Builds the prompt text for implementation agent.
 */
export function buildImplementationPrompt(params: PromptParams): string {
  const {
    repoFullName,
    ticketNumber,
    displayId,
    currentColumnId,
    defaultBranch,
    halApiBaseUrl,
    goal,
    deliverable,
    criteria,
    existingPrUrl,
  } = params

  const basePrompt = [
    'Implement this ticket.',
    '',
    '## Inputs (provided by HAL)',
    `- **agentType**: implementation`,
    `- **repoFullName**: ${repoFullName}`,
    `- **ticketNumber**: ${ticketNumber}`,
    `- **displayId**: ${displayId}`,
    `- **currentColumnId**: ${currentColumnId || 'col-unassigned'}`,
    `- **defaultBranch**: ${defaultBranch}`,
    `- **HAL API base URL**: ${halApiBaseUrl}`,
    '',
    '## Tools you can use',
    '- Cursor Cloud Agent built-ins: read/search/edit files, run shell commands (git, npm), and use `gh` for GitHub.',
    '- HAL server endpoints (no Supabase creds required): `POST /api/artifacts/insert-implementation`, `POST /api/artifacts/get`, `POST /api/tickets/move`.',
    '',
    '## MANDATORY first step: pull latest from main',
    '',
    '**Before starting any work**, pull the latest code. Do not assume you have the latest code.',
    'Run: `git checkout main && git pull origin main`',
    'Then create or checkout your feature branch and proceed.',
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

  if (existingPrUrl) {
    return `${basePrompt}\n\n## Existing PR linked\n\nA PR is already linked to this ticket:\n\n- ${existingPrUrl}\n\nDo NOT create a new PR. Push changes to the branch above so the existing PR updates.`
  }

  return basePrompt
}

/**
 * Builds the prompt text for QA agent.
 */
export function buildQAPrompt(params: PromptParams): string {
  const { repoFullName, ticketNumber, displayId, currentColumnId, defaultBranch, halApiBaseUrl, goal, deliverable, criteria } = params

  return [
    'QA this ticket implementation. Review the code, generate a QA report, and complete the QA workflow.',
    '',
    '## Inputs (provided by HAL)',
    `- **agentType**: qa`,
    `- **repoFullName**: ${repoFullName}`,
    `- **ticketNumber**: ${ticketNumber}`,
    `- **displayId**: ${displayId}`,
    `- **currentColumnId**: ${currentColumnId || 'col-unassigned'}`,
    `- **defaultBranch**: ${defaultBranch}`,
    `- **HAL API base URL**: ${halApiBaseUrl}`,
    '',
    '## Tools you can use',
    '- Cursor Cloud Agent built-ins: read/search/edit files, run shell commands (git, npm), and use `gh` for GitHub.',
    '- HAL server endpoints (no Supabase creds required): `POST /api/artifacts/insert-qa`, `POST /api/artifacts/get`, `POST /api/tickets/move`.',
    '',
    '## MANDATORY first step: pull latest from main',
    '',
    '**Before starting any QA work**, pull the latest code. Do not assume you have the latest code.',
    'Run: `git checkout main && git pull origin main`',
    '',
    '## MANDATORY: Load Your Instructions First',
    '',
    '**BEFORE starting any QA work, you MUST load your basic instructions from Supabase.**',
    '',
    '**Step 1: Load basic instructions:**',
    '```javascript',
    'const baseUrl = process.env.HAL_API_URL || \'http://localhost:5173\'',
    'const res = await fetch(`${baseUrl}/api/instructions/get`, {',
    '  method: \'POST\',',
    '  headers: { \'Content-Type\': \'application/json\' },',
    '  body: JSON.stringify({',
    '    agentType: \'qa\',',
    '    includeBasic: true,',
    '    includeSituational: false,',
    '  }),',
    '})',
    'const result = await res.json()',
    'if (result.success) {',
    '  // result.instructions contains your basic instructions',
    '  // These include all mandatory workflows, QA report requirements, and procedures',
    '  // READ AND FOLLOW THESE INSTRUCTIONS - they contain critical requirements',
    '}',
    '```',
    '',
    '**The instructions from Supabase contain:**',
    '- Required implementation artifacts you must verify before starting QA',
    '- How to structure and store QA reports',
    '- When to pass/fail tickets',
    '- How to move tickets after QA',
    '- Code citation requirements',
    '- All other mandatory QA workflows',
    '',
    '**DO NOT proceed with QA until you have loaded and read your instructions from Supabase.**',
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
}

/**
 * Determines the branch name based on agent type and ticket number.
 */
export function determineBranchName(agentType: AgentType, ticketNumber: number, defaultBranch: string = 'main'): string {
  if (agentType === 'implementation') {
    return `ticket/${String(ticketNumber).padStart(4, '0')}-implementation`
  }
  return defaultBranch
}

/**
 * Checks for an existing PR URL linked to the ticket.
 * Returns the PR URL if found, null otherwise.
 */
export async function checkForExistingPrUrl(
  supabase: SupabaseClient<any, 'public', any>,
  ticketPk: string
): Promise<string | null> {
  const { data: linked } = await supabase
    .from('hal_agent_runs')
    .select('pr_url, created_at')
    .eq('ticket_pk', ticketPk)
    .not('pr_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
  const prUrl = Array.isArray(linked) && linked.length ? (linked[0] as any)?.pr_url : null
  if (typeof prUrl === 'string' && prUrl.trim()) {
    return prUrl.trim()
  }
  return null
}

/**
 * Parses and normalizes agent type from request body.
 * Defaults to 'implementation' if not specified or invalid.
 */
export function parseAgentType(bodyAgentType: unknown): AgentType {
  if (bodyAgentType === 'qa') return 'qa'
  if (bodyAgentType === 'project-manager') return 'project-manager'
  if (bodyAgentType === 'process-review') return 'process-review'
  return 'implementation'
}

/**
 * Validates launch inputs and returns validation error message if invalid.
 * Returns null if validation passes.
 */
export function validateLaunchInputs(
  repoFullName: string,
  agentType: AgentType,
  ticketNumber: number | null,
  message: string
): string | null {
  if (!repoFullName) {
    return 'repoFullName is required.'
  }

  const needsTicket = agentType === 'implementation' || agentType === 'qa' || agentType === 'process-review'
  if (needsTicket && (!ticketNumber || !Number.isFinite(ticketNumber))) {
    return 'ticketNumber is required.'
  }

  if (agentType === 'project-manager' && !message) {
    return 'message is required for project-manager runs.'
  }

  return null
}

/**
 * Checks for an existing active run for the given ticket and agent type.
 * Returns the existing run data if found, null otherwise.
 */
export interface ExistingRunResult {
  runId: string
  status: string
  cursorAgentId: string | null
}

export async function checkForExistingActiveRun(
  supabase: SupabaseClient<any, 'public', any>,
  repoFullName: string,
  ticketNumber: number,
  agentType: AgentType
): Promise<ExistingRunResult | null> {
  const activeStatuses = ['created', 'launching', 'polling', 'running', 'reviewing']
  const { data: existingRun, error: existingRunErr } = await supabase
    .from('hal_agent_runs')
    .select('run_id, status, cursor_agent_id')
    .eq('repo_full_name', repoFullName)
    .eq('ticket_number', ticketNumber)
    .eq('agent_type', agentType)
    .in('status', activeStatuses)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingRunErr) {
    // Log error but continue - this is a best-effort check
    console.warn(`[agent-runs/launch] Error checking for existing run: ${existingRunErr.message}`)
    return null
  }

  if (!existingRun?.run_id) {
    return null
  }

  return {
    runId: existingRun.run_id as string,
    status: (existingRun as any).status as string,
    cursorAgentId: (existingRun as any).cursor_agent_id as string | null,
  }
}

/**
 * Moves a QA ticket from QA column to Doing column when QA agent starts.
 * Returns true if move was successful or not needed, false if move failed.
 */
export async function moveQATicketToDoing(
  supabase: SupabaseClient<any, 'public', any>,
  ticketPk: string,
  repoFullName: string,
  displayId: string,
  currentColumnId: string | null
): Promise<boolean> {
  if (currentColumnId !== 'col-qa') {
    return true // Not in QA column, no move needed
  }

  try {
    const { data: inColumn } = await supabase
      .from('tickets')
      .select('kanban_position')
      .eq('repo_full_name', repoFullName)
      .eq('kanban_column_id', 'col-doing')
      .order('kanban_position', { ascending: false })
      .limit(1)

    const nextPosition = inColumn && inColumn.length ? ((inColumn[0] as any)?.kanban_position ?? -1) + 1 : 0
    const movedAt = new Date().toISOString()
    const { error: updateErr } = await supabase
      .from('tickets')
      .update({ kanban_column_id: 'col-doing', kanban_position: nextPosition, kanban_moved_at: movedAt })
      .eq('pk', ticketPk)

    if (updateErr) {
      // Log error but don't fail the launch - ticket will stay in QA
      console.error(`[QA Agent] Failed to move ticket ${displayId} from QA to Doing:`, updateErr.message)
      return false
    }

    return true
  } catch (moveErr) {
    // Log error but don't fail the launch
    console.error(
      `[QA Agent] Error moving ticket ${displayId} from QA to Doing:`,
      moveErr instanceof Error ? moveErr.message : String(moveErr)
    )
    return false
  }
}
