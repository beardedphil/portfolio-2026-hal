/**
 * Helper functions extracted from run.ts for better testability and maintainability.
 */

export interface TicketBodySections {
  goal: string
  deliverable: string
  criteria: string
}

export interface BuildPromptParams {
  repoFullName: string
  ticketId: string
  displayId: string
  currentColumnId: string | null
  halApiUrl: string
  goal: string
  deliverable: string
  criteria: string
  bodyMd: string
  implementationAgentNote: string | null
  isBackInTodo: boolean
}

/**
 * Parses ticket ID from message string.
 * Expects format: "Implement ticket XXXX" where XXXX is a 4-digit number.
 */
export function parseTicketId(message: string): string | null {
  const match = message.match(/implement\s+ticket\s+(\d{4})(?:\D|$)/i)
  return match ? match[1] : null
}

/**
 * Parses goal, deliverable, and criteria sections from ticket body markdown.
 */
export function parseTicketBodySections(bodyMd: string): TicketBodySections {
  const goalMatch = bodyMd.match(/##\s*Goal\s*\([^)]*\)\s*\n([\s\S]*?)(?=\n##|$)/i)
  const deliverableMatch = bodyMd.match(/##\s*Human-verifiable deliverable[^\n]*\n([\s\S]*?)(?=\n##|$)/i)
  const criteriaMatch = bodyMd.match(/##\s*Acceptance criteria[^\n]*\n([\s\S]*?)(?=\n##|$)/i)

  return {
    goal: (goalMatch?.[1] ?? '').trim(),
    deliverable: (deliverableMatch?.[1] ?? '').trim(),
    criteria: (criteriaMatch?.[1] ?? '').trim(),
  }
}

/**
 * Finds implementation agent note from QA artifacts.
 * Looks for artifacts with titles containing "implementation agent note" or "note for implementation agent".
 */
export function findImplementationAgentNote(
  artifacts: Array<{ title?: string; body_md?: string }>
): string | null {
  const noteArtifact = artifacts.find(
    (a) =>
      a.title &&
      (a.title.toLowerCase().includes('implementation agent note') ||
        a.title.toLowerCase().includes('note for implementation agent'))
  )

  if (noteArtifact?.body_md && noteArtifact.body_md.trim().length > 0) {
    return noteArtifact.body_md.trim()
  }

  return null
}

/**
 * Builds the prompt text for the implementation agent.
 */
export function buildPromptText(params: BuildPromptParams): string {
  const {
    repoFullName,
    ticketId,
    displayId,
    currentColumnId,
    halApiUrl,
    goal,
    deliverable,
    criteria,
    bodyMd,
    implementationAgentNote,
    isBackInTodo,
  } = params

  const failureNotesSection = implementationAgentNote
    ? [
        '## IMPORTANT: Previous QA Failure — Implementation Agent Note',
        '',
        '**This ticket previously failed QA. The following note from QA explains what went wrong and what you must fix:**',
        '',
        '```',
        implementationAgentNote,
        '```',
        '',
        '**You MUST address every issue and required action above. Do NOT simply re-implement the same solution.**',
        '',
      ]
    : [
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
      ]

  return [
    'Implement this ticket.',
    '',
    '## Inputs (provided by HAL)',
    `- **repoFullName**: ${repoFullName}`,
    `- **ticketId**: ${ticketId}`,
    `- **displayId**: ${displayId}`,
    `- **currentColumnId**: ${currentColumnId || 'col-unassigned'}`,
    `- **HAL API Base URL**: ${halApiUrl}`,
    '',
    '## Tools you can use',
    '- Cursor Cloud Agent built-ins: read/search/edit files, run shell commands (git, npm), and use `gh` for GitHub.',
    '- HAL server endpoints (no Supabase creds required): `POST /api/artifacts/insert-implementation`, `POST /api/agent-tools/execute` (tool: `get_artifacts`), `POST /api/tickets/move`.',
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
    ...failureNotesSection,
    '',
    '## MANDATORY: Store All Required Artifacts',
    '',
    '**YOU MUST store ALL 8 required artifacts before marking the ticket ready for QA. This is MANDATORY, not optional.**',
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
    '   - **MANDATORY:** This artifact is REQUIRED on every ticket. It must NEVER be omitted or left blank. You MUST store it, even if no files changed.',
    '   - **Content must be NON-EMPTY:** The Changed Files artifact body_md must contain substantive content. Leaving it blank or omitting it is a process failure and will cause QA to fail.',
    '   - **When files changed:** Must include:',
    '     - A list of all file paths that were created, modified, or deleted',
    '     - A brief one-line description of what changed in each file',
    '     - Example format: `- path/to/file.ts — Added new function to handle user authentication`',
    '   - **When no files changed:** You MUST explicitly write:',
    '     - `No files changed.`',
    '     - Followed by a brief reason (e.g., "Docs-only ticket handled via Supabase updates" / "Investigation only; no code changes made" / "Repro failed; no code changes made")',
    '     - Example: `No files changed. This ticket was documentation-only and all changes were made via Supabase updates.`',
    '   - **Process failure conditions:**',
    '     - Leaving the Changed Files artifact blank or empty is a process failure',
    '     - Omitting the Changed Files artifact entirely is a process failure',
    '     - Using placeholder text like "(none)" or "(No files changed in this PR)" without the explicit "No files changed." statement is a process failure',
    '     - QA will fail immediately if the Changed Files artifact is missing, empty, or contains only placeholder text',
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
    '8. **Instructions Used** (`artifactType: "instructions-used"`, title: `Instructions Used for ticket ${displayId}`)',
    '   - Must include: List of instruction sets or topics that were referenced during implementation',
    '   - If you used any agent instructions (via `get_instruction_set` tool or HAL API `/api/instructions/get-topic`), list them here',
    '   - Include any agent instructions, cursor rules, or process documents that guided your work',
    '   - If no specific instructions were used beyond the standard implementation workflow, state that explicitly',
    '   - This helps track which instructions are most useful for future improvements',
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
    '**IMPORTANT:** All Supabase operations must be done via HAL API. See `docs/process/hal-tool-call-contract.mdc` for endpoints. Read `.hal/api-base-url` for base URL.',
    '',
    '**HAL API Base URL:**',
    '',
    `\`${halApiUrl}\``,
    '',
    '**Note:** You can also read `.hal/api-base-url` from the repo if needed, but the base URL is provided above.',
    '',
    '**Available HAL API endpoints:**',
    '',
    '1. **`POST /api/artifacts/insert-implementation`** - Store implementation artifact (MANDATORY - store all 8 required artifacts)',
    '   - Body: `{ ticketId: string, artifactType: string, title: string, body_md: string }`',
    '   - Artifact types: `"plan"`, `"worklog"`, `"changed-files"`, `"decisions"`, `"verification"`, `"pm-review"`, `"git-diff"`, `"instructions-used"`',
    '   - **MANDATORY:** Store ALL 8 required artifacts before marking ticket ready for QA',
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
    '   - **Moving to Ready for QA (col-qa) is gated:** the API will reject the move if any of the 8 required implementation artifacts are missing or empty. You must store all 8 first.',
    '',
    '## Before moving to Ready for QA',
    '',
    'Before calling POST /api/tickets/move with columnId `col-qa`, you MUST:',
    '',
    '1. Call get_artifacts (or POST /api/artifacts/get) for this ticket.',
    '2. Verify all 8 required implementation artifact types are present and have substantive content.',
    '3. If any are missing, store them via POST /api/artifacts/insert-implementation.',
    '4. Only then call POST /api/tickets/move with columnId `col-qa`.',
    '',
    '**Required artifact types (checklist):** plan, worklog, changed-files, decisions, verification, pm-review, git-diff, instructions-used.',
    '',
    '**If move returns success: false and missingArtifacts:** Store each listed artifact type via POST /api/artifacts/insert-implementation, then retry the move.',
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
    '// 4. Continue storing all 8 required artifacts as you work...',
    '```',
    '',
    '**No credentials needed** - The HAL server uses its own Supabase credentials. Just call the API endpoints directly.',
  ]
    .filter(Boolean)
    .join('\n')
}
