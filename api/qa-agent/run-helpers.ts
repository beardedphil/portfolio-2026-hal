/**
 * Helper functions extracted from run.ts for better testability and maintainability.
 */

import type { IncomingMessage } from 'http'

export interface TicketBodySections {
  goal: string
  deliverable: string
  criteria: string
}

export interface BuildPromptParams {
  repoFullName: string
  ticketId: string
  displayId: string
  branchName: string
  refForApi: string
  halApiUrl: string
  goal: string
  deliverable: string
  criteria: string
  qaRules: string
  verifyFromMainNote: string
}

/**
 * Formats Cursor API error status codes into human-readable error messages.
 */
export function humanReadableCursorError(status: number, detail?: string): string {
  if (status === 401) return 'Cursor API authentication failed. Check that CURSOR_API_KEY is valid.'
  if (status === 403) return 'Cursor API access denied. Your plan may not include Cloud Agents API.'
  if (status === 429) return 'Cursor API rate limit exceeded. Please try again in a moment.'
  if (status >= 500) return `Cursor API server error (${status}). Please try again later.`
  const suffix = detail ? ` — ${String(detail).slice(0, 100)}` : ''
  return `Cursor API request failed (${status})${suffix}`
}

/**
 * Reads and parses JSON body from HTTP request.
 */
export async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return {}
  return JSON.parse(raw) as unknown
}

/**
 * Parses ticket ID from message string.
 * Expects format: "QA ticket XXXX" where XXXX is a 4-digit number.
 */
export function parseTicketId(message: string): string | null {
  const match = message.match(/qa\s+ticket\s+(\d{4})(?:\D|$)/i)
  return match ? match[1] : null
}

/**
 * Extracts branch name and determines ref for API from ticket body.
 */
export function extractBranchInfo(bodyMd: string, ticketId: string): { branchName: string; refForApi: string } {
  const branchMatch = bodyMd.match(/-?\s*\*\*Branch\*\*:\s*`?([^`\n]+)`?/i)
  const branchName = branchMatch ? branchMatch[1].trim() : `ticket/${ticketId}-implementation`
  const mergedToMainForQA = /merged to\s*`?main`?\s*for\s*QA\s*access/i.test(bodyMd)
  const refForApi: string = mergedToMainForQA ? 'main' : branchName
  return { branchName, refForApi }
}

/**
 * Parses goal, deliverable, and criteria sections from ticket body markdown.
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

/**
 * Builds the prompt text for the QA agent.
 */
export function buildPromptText(params: BuildPromptParams): string {
  const {
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
  } = params

  return [
    `QA this ticket implementation. Review the code, generate a QA report, and complete the QA workflow.${verifyFromMainNote}`,
    '',
    '## Inputs (provided by HAL)',
    `- **repoFullName**: ${repoFullName}`,
    `- **ticketId**: ${ticketId}`,
    `- **displayId**: ${displayId}`,
    `- **branchName (context)**: ${branchName}`,
    `- **verifyFrom (ref)**: \`${refForApi}\``,
    `- **HAL API Base URL**: ${halApiUrl}`,
    '',
    '## Tools you can use',
    '- Cursor Cloud Agent built-ins: read/search/edit files, run shell commands (git, npm), and use `gh` for GitHub.',
    '- HAL server tool endpoint (no Supabase creds required): `POST /api/agent-tools/execute` with `tool` = `get_artifacts`, `insert_qa_artifact`, `move_ticket_column`.',
    '',
    '## Ticket',
    `**ID**: ${displayId}`,
    `**Repo**: ${repoFullName}`,
    `**Branch (for context; use ref below)**: ${branchName}`,
    `**Verify from**: \`${refForApi}\``,
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
    '## HAL Tool Call Contract',
    '',
    '**IMPORTANT:** All Supabase operations (storing QA reports, updating tickets, moving tickets) must be sent to HAL as **tool calls** in your messages. HAL will parse and execute them automatically.',
    '',
    '**Send tool calls as JSON blocks in your messages:**',
    '',
    '```json',
    '{',
    '  "tool": "tool_name",',
    '  "params": {',
    '    "param1": "value1"',
    '  }',
    '}',
    '```',
    '',
    '**Required tools for QA:**',
    '',
    '1. **`insert_qa_artifact`** - Store QA report',
    '   - Params: `{ ticketId: string, title: string, body_md: string }`',
    '   - Title format: `"QA report for ticket <ticket-id>"`',
    '   - Store QA report after completing code review and verification',
    '',
    '2. **`move_ticket_column`** - Move ticket to Human in the Loop',
    '   - Params: `{ ticketId: string, columnId: "col-human-in-the-loop" }`',
    '   - Call this after storing QA report and completing workflow',
    '',
    '3. **`get_ticket_content`** - Fetch ticket content (if needed)',
    '   - Params: `{ ticketId: string }`',
    '',
    '4. **`get_artifacts`** - Fetch all artifacts for a ticket (REQUIRED before QA)',
    '   - Params: `{ ticketId: string }`',
    '   - Returns: `{ success: boolean, artifacts: array }`',
    '   - **MUST use this tool FIRST** to check for required implementation artifacts before proceeding with QA',
    '',
    '**Example:** Include tool calls in your message:',
    '',
    '```',
    'QA complete. Here\'s my tool call to store the QA report:',
    '',
    '{',
    '  "tool": "insert_qa_artifact",',
    '  "params": {',
    '    "ticketId": "0076",',
    '    "title": "QA report for ticket 0076",',
    '    "body_md": "# QA Report\\n\\n..."',
    '  }',
    '}',
    '',
    'Moving ticket to Human in the Loop:',
    '',
    '{',
    '  "tool": "move_ticket_column",',
    '  "params": {',
    '    "ticketId": "0076",',
    '    "columnId": "col-human-in-the-loop"',
    '  }',
    '}',
    '```',
    '',
    'HAL will parse and execute the tool calls automatically. You don\'t need API URLs or credentials.',
    '',
    '## QA Rules',
    qaRules,
  ].join('\n')
}
