/**
 * Helper functions for agent-runs/launch.ts
 * Extracted to improve testability and maintainability.
 */

export type AgentType = 'implementation' | 'qa' | 'project-manager' | 'process-review'

/**
 * Parses and validates agent type from request body.
 * Defaults to 'implementation' if not specified or invalid.
 */
export function parseAgentType(bodyAgentType?: string): AgentType {
  if (bodyAgentType === 'qa') return 'qa'
  if (bodyAgentType === 'project-manager') return 'project-manager'
  if (bodyAgentType === 'process-review') return 'process-review'
  return 'implementation'
}

/**
 * Extracts ticket body sections (goal, deliverable, acceptance criteria) from markdown.
 */
export function parseTicketBodySections(bodyMd: string): {
  goal: string
  deliverable: string
  criteria: string
} {
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
 * Extracts branch name from ticket body for QA agents.
 * Looks for pattern: "## QA ... Branch: <branch-name>" or "## QA ... Branch <branch-name>"
 * The branch name must be on the same line as "Branch:" or "Branch "
 */
export function extractBranchNameFromTicketBody(bodyMd: string): string | null {
  // Match "## QA" section, then find "Branch:" or "Branch " on a line, capture the rest of that line
  const branchMatch = bodyMd.match(/##\s*QA[^\n]*\n[\s\S]*?Branch[:\s]+([^\n]+)/i)
  if (!branchMatch) return null
  const branchName = branchMatch[1]?.trim()
  // Return null if the match is empty, too long, or doesn't look like a branch name
  // Branch names typically don't end with periods and are usually short
  if (!branchName || branchName.length > 100 || branchName.endsWith('.')) return null
  // If it looks like a sentence (contains common sentence words), it's probably not a branch name
  if (/^(no|the|a|an|some|any)\s+/i.test(branchName)) return null
  return branchName
}

/**
 * Builds prompt text for implementation agent.
 */
export function buildImplementationPrompt(params: {
  repoFullName: string
  ticketNumber: number
  displayId: string
  currentColumnId: string | null
  defaultBranch: string
  halApiBaseUrl: string
  goal: string
  deliverable: string
  criteria: string
}): string {
  return [
    'Implement this ticket.',
    '',
    '## Inputs (provided by HAL)',
    `- **agentType**: implementation`,
    `- **repoFullName**: ${params.repoFullName}`,
    `- **ticketNumber**: ${params.ticketNumber}`,
    `- **displayId**: ${params.displayId}`,
    `- **currentColumnId**: ${params.currentColumnId || 'col-unassigned'}`,
    `- **defaultBranch**: ${params.defaultBranch}`,
    `- **HAL API base URL**: ${params.halApiBaseUrl}`,
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
    `**ID**: ${params.displayId}`,
    `**Repo**: ${params.repoFullName}`,
    '',
    '## Goal',
    params.goal || '(not specified)',
    '',
    '## Human-verifiable deliverable',
    params.deliverable || '(not specified)',
    '',
    '## Acceptance criteria',
    params.criteria || '(not specified)',
  ].join('\n')
}

/**
 * Builds prompt text for QA agent.
 */
export function buildQAPrompt(params: {
  repoFullName: string
  ticketNumber: number
  displayId: string
  currentColumnId: string | null
  defaultBranch: string
  halApiBaseUrl: string
  goal: string
  deliverable: string
  criteria: string
}): string {
  return [
    'QA this ticket implementation. Review the code, generate a QA report, and complete the QA workflow.',
    '',
    '## Inputs (provided by HAL)',
    `- **agentType**: qa`,
    `- **repoFullName**: ${params.repoFullName}`,
    `- **ticketNumber**: ${params.ticketNumber}`,
    `- **displayId**: ${params.displayId}`,
    `- **currentColumnId**: ${params.currentColumnId || 'col-unassigned'}`,
    `- **defaultBranch**: ${params.defaultBranch}`,
    `- **HAL API base URL**: ${params.halApiBaseUrl}`,
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
    `**ID**: ${params.displayId}`,
    `**Repo**: ${params.repoFullName}`,
    '',
    '## Goal',
    params.goal || '(not specified)',
    '',
    '## Human-verifiable deliverable',
    params.deliverable || '(not specified)',
    '',
    '## Acceptance criteria',
    params.criteria || '(not specified)',
  ].join('\n')
}

/**
 * Determines the branch name to use for Cursor agent launch.
 */
export function getBranchNameForLaunch(agentType: AgentType, ticketNumber: number, defaultBranch: string): string {
  return agentType === 'implementation' ? `ticket/${String(ticketNumber).padStart(4, '0')}-implementation` : defaultBranch
}
