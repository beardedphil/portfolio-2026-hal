import path from 'path'
import fs from 'fs'
import { buildPromptFromTicket } from './agent-helpers'

/** Extract branch name from ticket body markdown */
export function extractBranchName(bodyMd: string, ticketId: string): string | null {
  const branchMatch = bodyMd.match(/-?\s*\*\*Branch\*\*:\s*`?([^`\n]+)`?/i)
  if (branchMatch) {
    return branchMatch[1].trim()
  }
  
  // Fallback: construct branch name from ticket ID and title
  const titleMatch = bodyMd.match(/-?\s*\*\*Title\*\*:\s*(.+?)(?:\n|$)/i)
  const title = titleMatch ? titleMatch[1].trim() : 'unknown'
  const slug = title
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'ticket'
  return `ticket/${ticketId}-${slug}`
}

/** Build QA prompt text from ticket and rules */
export function buildQAPrompt(
  bodyMd: string,
  ticketId: string,
  branchName: string,
  refForApi: string,
  repoRoot: string
): string {
  const ticketSections = buildPromptFromTicket(bodyMd)
  
  // Read QA ruleset
  const qaRulesPath = path.join(repoRoot, '.cursor', 'rules', 'qa-audit-report.mdc')
  let qaRules = ''
  try {
    qaRules = fs.readFileSync(qaRulesPath, 'utf8')
  } catch {
    qaRules = '# QA Audit Report\n\nWhen you QA a ticket, you must add a QA report to the ticket\'s audit folder.'
  }

  const verifyFromMainNote =
    refForApi === 'main'
      ? '\n**Verify from:** `main` (implementation was merged to main for QA access). Do NOT attempt to check out or use the feature branch; use the latest `main` only.\n'
      : ''

  return [
    `QA this ticket implementation. Review the code, generate a QA report, and complete the QA workflow.${verifyFromMainNote}`,
    '',
    '## Ticket',
    `**ID**: ${ticketId}`,
    `**Branch (for context; use ref above)**: ${branchName}`,
    refForApi === 'main' ? '**Verify from:** `main`' : '',
    '',
    ticketSections,
    '',
    '## QA Rules',
    qaRules,
    '',
    '## Instructions',
    refForApi === 'main'
      ? '1. Review the implementation on `main` (already merged for QA access). Do NOT check out the feature branch.'
      : '1. Review the implementation on the feature branch.',
    '2. Check that all required audit artifacts exist (plan, worklog, changed-files, decisions, verification, pm-review).',
    '3. Perform code review and verify acceptance criteria.',
    '4. Generate `docs/audit/${ticketId}-<short-title>/qa-report.md` with:',
    '   - Ticket & deliverable summary',
    '   - Audit artifacts check',
    '   - Code review (PASS/FAIL with evidence)',
    '   - UI verification notes',
    '   - Verdict (PASS/FAIL)',
    '5. If PASS:',
    refForApi === 'main'
      ? '   - Commit and push the qa-report to main; move the ticket to Human in the Loop. Do NOT merge again or delete any branch.'
      : '   - Commit and push the qa-report to the feature branch, merge the feature branch into main, move the ticket to Human in the Loop (col-human-in-the-loop), delete the feature branch (local and remote).',
    '6. If FAIL:',
    '   - Commit and push the qa-report only',
    '   - Do NOT merge',
    '   - Report what failed and recommend a bugfix ticket',
  ].join('\n')
}
