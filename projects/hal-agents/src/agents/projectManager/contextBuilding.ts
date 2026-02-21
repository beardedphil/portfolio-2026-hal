/**
 * Context building for PM Agent — extracts conversation history, repo rules, templates, and git status.
 * Module: portfolio-2026-hal-agents (no server required).
 */

import fs from 'fs/promises'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import type { ConversationTurn, PmAgentConfig } from '../projectManager.js'

const execAsync = promisify(exec)

/** Cap on character count for "recent conversation" so long technical messages don't dominate. (~3k tokens) */
export const CONVERSATION_RECENT_MAX_CHARS = 12_000

/**
 * Filter conversation turns to fit within a character budget, keeping the most recent turns.
 * Returns the recent turns (in chronological order) and count of omitted turns.
 */
export function recentTurnsWithinCharBudget(
  turns: ConversationTurn[],
  maxChars: number
): { recent: ConversationTurn[]; omitted: number } {
  if (turns.length === 0) return { recent: [], omitted: 0 }
  let len = 0
  const recent: ConversationTurn[] = []
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i]
    const lineLen = (t.role?.length ?? 0) + (t.content?.length ?? 0) + 12
    if (len + lineLen > maxChars && recent.length > 0) break
    recent.unshift(t)
    len += lineLen
  }
  return { recent, omitted: turns.length - recent.length }
}

/**
 * Build conversation section from context pack or history.
 * Returns the conversation section text and whether conversation exists.
 */
export function buildConversationSection(
  config: PmAgentConfig,
  userMessage: string
): { section: string; hasConversation: boolean } {
  if (config.conversationContextPack && config.conversationContextPack.trim() !== '') {
    const section = '## Conversation so far\n\n' + config.conversationContextPack.trim()
    return { section, hasConversation: true }
  }

  const history = config.conversationHistory
  if (history && history.length > 0) {
    const { recent, omitted } = recentTurnsWithinCharBudget(history, CONVERSATION_RECENT_MAX_CHARS)
    const truncNote =
      omitted > 0
        ? `\n(older messages omitted; showing recent conversation within ${CONVERSATION_RECENT_MAX_CHARS.toLocaleString()} characters)\n\n`
        : '\n\n'
    const lines = recent.map((t) => `**${t.role}**: ${t.content}`)
    const section = '## Conversation so far' + truncNote + lines.join('\n\n')
    return { section, hasConversation: true }
  }

  return { section: '', hasConversation: false }
}

/**
 * Load repo rules from .cursor/rules/ directory.
 * Returns the rules section text.
 */
export async function loadRepoRules(repoRoot: string, rulesDir: string): Promise<string> {
  const rulesPath = path.resolve(repoRoot, rulesDir)
  try {
    const entries = await fs.readdir(rulesPath)
    const mdcFiles = entries.filter((e: string) => e.endsWith('.mdc'))
    if (mdcFiles.length === 0) {
      return '## Repo rules (from .cursor/rules/)\n\n(no .mdc files found)'
    }
    const sections: string[] = ['## Repo rules (from .cursor/rules/)']
    for (const f of mdcFiles) {
      const content = await fs.readFile(path.join(rulesPath, f), 'utf8')
      sections.push(`### ${f}\n\n${content}`)
    }
    return sections.join('\n\n')
  } catch {
    return '## Repo rules (from .cursor/rules/)\n\n(rules directory not found or not readable)'
  }
}

/**
 * Load ticket template from docs/templates/ticket.template.md.
 * Returns the template section text.
 */
export async function loadTicketTemplate(repoRoot: string): Promise<string> {
  try {
    const templatePath = path.resolve(repoRoot, 'docs/templates/ticket.template.md')
    const templateContent = await fs.readFile(templatePath, 'utf8')
    return (
      '## Ticket template (required structure for create_ticket)\n\n' +
      templateContent +
      '\n\nWhen creating a ticket, use this exact section structure. Replace every placeholder in angle brackets (e.g. `<what we want to achieve>`, `<AC 1>`) with concrete content—the resulting ticket must pass the Ready-to-start checklist (no unresolved placeholders, all required sections filled).'
    )
  } catch {
    return '## Ticket template (required structure for create_ticket)\n\n(docs/templates/ticket.template.md not found)'
  }
}

/**
 * Load ready-to-start checklist from docs/process/ready-to-start-checklist.md.
 * Returns the checklist section text.
 */
export async function loadReadyToStartChecklist(repoRoot: string): Promise<string> {
  try {
    const checklistPath = path.resolve(repoRoot, 'docs/process/ready-to-start-checklist.md')
    const content = await fs.readFile(checklistPath, 'utf8')
    return '## Ready-to-start checklist (Definition of Ready)\n\n' + content
  } catch {
    return '## Ready-to-start checklist (Definition of Ready)\n\n(docs/process/ready-to-start-checklist.md not found)'
  }
}

/**
 * Load git status using git status -sb command.
 * Returns the git status section text.
 */
export async function loadGitStatus(repoRoot: string): Promise<string> {
  try {
    const { stdout } = await execAsync('git status -sb', {
      cwd: repoRoot,
      encoding: 'utf8',
    })
    return '## Git status (git status -sb)\n\n```\n' + stdout.trim() + '\n```'
  } catch {
    return '## Git status (git status -sb)\n\n(git status failed)'
  }
}

/**
 * Build the complete context pack for PM Agent.
 * Combines conversation history, user message, repo rules, templates, checklist, and git status.
 */
export async function buildContextPack(config: PmAgentConfig, userMessage: string): Promise<string> {
  const rulesDir = config.rulesDir ?? '.cursor/rules'
  const sections: string[] = []

  // Build conversation section
  const { section: conversationSection, hasConversation } = buildConversationSection(config, userMessage)
  if (hasConversation) {
    sections.push(conversationSection)
    sections.push('## User message (latest reply in the conversation above)\n\n' + userMessage)
  } else {
    sections.push('## User message\n\n' + userMessage)
  }

  // Load all context sections in parallel
  const [repoRules, ticketTemplate, checklist, gitStatus] = await Promise.all([
    loadRepoRules(config.repoRoot, rulesDir),
    loadTicketTemplate(config.repoRoot),
    loadReadyToStartChecklist(config.repoRoot),
    loadGitStatus(config.repoRoot),
  ])

  sections.push(repoRules, ticketTemplate, checklist, gitStatus)

  return sections.join('\n\n')
}
