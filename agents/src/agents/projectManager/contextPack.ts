/**
 * Context pack building for PM agent.
 */

import fs from 'fs/promises'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import type { ConversationTurn, PmAgentConfig } from './types.js'
import { loadInstructionBootstrap } from './instructionLoading.js'

const execAsync = promisify(exec)

/** Cap on character count for "recent conversation" so long technical messages don't dominate. (~3k tokens) */
const CONVERSATION_RECENT_MAX_CHARS = 12_000


/**
 * Filters conversation turns to fit within a character budget, keeping the most recent turns.
 * @param turns - Array of conversation turns to filter
 * @param maxChars - Maximum character count allowed
 * @returns Object with filtered recent turns and count of omitted turns
 */
export function recentTurnsWithinCharBudget(
  turns: ConversationTurn[],
  maxChars: number
): { recent: ConversationTurn[]; omitted: number } {
  if (turns.length === 0) return { recent: [], omitted: 0 }
  
  let len = 0
  const recent: ConversationTurn[] = []
  
  // Process from most recent to oldest
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i]
    const turnLength = (turn.role?.length ?? 0) + (turn.content?.length ?? 0) + 12
    
    // Stop if adding this turn would exceed budget (but always include at least one turn)
    if (len + turnLength > maxChars && recent.length > 0) break
    
    recent.unshift(turn)
    len += turnLength
  }
  
  return { recent, omitted: turns.length - recent.length }
}

/** Curated PM rule files for local-first loading. */
const PM_LOCAL_RULES = [
  'agent-instructions.mdc',
  'ac-confirmation-checklist.mdc',
  'code-citation-requirements.mdc',
  'qa-audit-report.mdc',
] as const

/**
 * Builds the list of available tools based on configuration.
 */
function buildAvailableToolsList(hasSupabase: boolean, imageCount: number): Array<{ name: string; available: boolean }> {
  return [
    { name: 'get_instruction_set', available: true },
    { name: 'list_directory', available: true },
    { name: 'read_file', available: true },
    { name: 'search_files', available: true },
    { name: 'evaluate_ticket_ready', available: true },
    { name: 'create_ticket', available: hasSupabase },
    { name: 'fetch_ticket_content', available: hasSupabase },
    { name: 'update_ticket_body', available: hasSupabase },
    { name: 'sync_tickets', available: hasSupabase },
    { name: 'kanban_move_ticket_to_todo', available: hasSupabase },
    { name: 'list_tickets_by_column', available: hasSupabase },
    { name: 'move_ticket_to_column', available: hasSupabase },
    { name: 'list_available_repos', available: hasSupabase },
    { name: 'kanban_move_ticket_to_other_repo_todo', available: hasSupabase },
    { name: 'attach_image_to_ticket', available: hasSupabase && imageCount > 0 },
  ]
}

/**
 * Formats the conversation section from config.
 * @param config - PM agent configuration
 * @returns Formatted conversation section or null if no conversation
 */
function formatConversationSection(config: PmAgentConfig): string | null {
  // Prefer pre-built context pack over history
  if (hasNonEmptyString(config.conversationContextPack)) {
    return '## Conversation so far\n\n' + config.conversationContextPack!.trim()
  }

  // Fall back to conversation history
  const history = config.conversationHistory
  if (!history || history.length === 0) {
    return null
  }

  const { recent, omitted } = recentTurnsWithinCharBudget(history, CONVERSATION_RECENT_MAX_CHARS)
  const truncNote =
    omitted > 0
      ? `\n(older messages omitted; showing recent conversation within ${CONVERSATION_RECENT_MAX_CHARS.toLocaleString()} characters)\n\n`
      : '\n\n'
  const lines = recent.map((t) => `**${t.role}**: ${t.content}`)
  return '## Conversation so far' + truncNote + lines.join('\n\n')
}


/**
 * Checks if Supabase credentials are available.
 */
function hasSupabaseCredentials(config: PmAgentConfig): boolean {
  return (
    typeof config.supabaseUrl === 'string' &&
    config.supabaseUrl.trim() !== '' &&
    typeof config.supabaseAnonKey === 'string' &&
    config.supabaseAnonKey.trim() !== ''
  )
}

/**
 * Checks if a string value is present and non-empty.
 */
function hasNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== ''
}

/**
 * Checks if OpenAI model is a vision model.
 */
function isVisionModel(model: string): boolean {
  return model.includes('vision') || model.includes('gpt-4o')
}

/**
 * Formats a summary of PM agent inputs and available tools.
 * @param config - PM agent configuration
 * @returns Formatted markdown string
 */
export function formatPmInputsSummary(config: PmAgentConfig): string {
  const hasSupabase = hasSupabaseCredentials(config)
  const hasGitHubRepo = hasNonEmptyString(config.repoFullName)
  const hasConversationContextPack = hasNonEmptyString(config.conversationContextPack)
  const hasConversationHistory = Array.isArray(config.conversationHistory) && config.conversationHistory.length > 0
  const hasWorkingMemoryText = hasNonEmptyString(config.workingMemoryText)
  const imageCount = Array.isArray(config.images) ? config.images.length : 0
  const openaiModel = String(config.openaiModel ?? '').trim()
  const isVision = isVisionModel(openaiModel)

  const availableTools = buildAvailableToolsList(hasSupabase, imageCount)
  const enabledTools = availableTools.filter((t) => t.available).map((t) => `- ${t.name}`)
  const disabledTools = availableTools.filter((t) => !t.available).map((t) => `- ${t.name}`)

  const conversationSource = hasConversationContextPack
    ? 'conversationContextPack (DB-derived)'
    : hasConversationHistory
      ? 'conversationHistory (client-provided)'
      : 'none'

  const lines: string[] = [
    '## Inputs (provided by HAL)',
    '',
    `- **repoFullName**: ${hasGitHubRepo ? config.repoFullName!.trim() : '(not provided)'}`,
    `- **repoRoot**: ${String(config.repoRoot ?? '').trim() || '(not provided)'}`,
    `- **openaiModel**: ${openaiModel || '(not provided)'}`,
    `- **previousResponseId**: ${String(config.previousResponseId ?? '').trim() ? 'present' : 'absent'}`,
    `- **supabase**: ${hasSupabase ? 'available (ticket tools enabled)' : 'not provided (ticket tools disabled)'}`,
    `- **conversation context**: ${conversationSource}`,
    `- **working memory**: ${hasWorkingMemoryText ? 'present' : 'absent'}`,
    `- **images**: ${imageCount} (${imageCount > 0 ? (isVision ? 'included' : 'ignored by model') : 'none'})`,
    '',
    '## Tools available (this run)',
    '',
    ...(enabledTools.length > 0 ? enabledTools : ['- (none)']),
    '',
    ...(disabledTools.length > 0
      ? [
          '## Tools not available (missing required inputs)',
          '',
          ...disabledTools,
        ]
      : []),
  ]

  return lines.join('\n')
}

export async function buildContextPack(config: PmAgentConfig, userMessage: string): Promise<string> {
  const rulesDir = config.rulesDir ?? '.cursor/rules'
  const rulesPath = path.resolve(config.repoRoot, rulesDir)

  const sections: string[] = []

  // Always include a compact list of HAL-provided inputs and enabled tools (helps debugging while keeping context small).
  sections.push(formatPmInputsSummary(config))

  // Local-first: try loading rules from repo
  let localLoaded = false
  let ticketTemplateContent: string | null = null
  let checklistContent: string | null = null
  let localRulesContent = ''

  try {
    const templatePath =
      path.join(config.repoRoot, 'docs/templates/ticket.template.md')
    const templateAltPath =
      path.join(config.repoRoot, 'projects/kanban/docs/templates/ticket.template.md')
    const checklistPath =
      path.join(config.repoRoot, 'docs/process/ready-to-start-checklist.md')

    let templateContent: string | null = null
    try {
      templateContent = await fs.readFile(templatePath, 'utf8')
    } catch {
      try {
        templateContent = await fs.readFile(templateAltPath, 'utf8')
      } catch {
        templateContent = null
      }
    }
    const checklistRead = await fs.readFile(checklistPath, 'utf8').catch(() => null)
    const agentInstructions = await fs
      .readFile(path.join(rulesPath, 'agent-instructions.mdc'), 'utf8')
      .catch(() => null)

    if (templateContent && checklistRead && agentInstructions) {
      ticketTemplateContent = templateContent
      checklistContent = checklistRead
      const ruleParts: string[] = [agentInstructions]
      for (const name of PM_LOCAL_RULES) {
        if (name === 'agent-instructions.mdc') continue
        const content = await fs
          .readFile(path.join(rulesPath, name), 'utf8')
          .catch(() => '')
        if (content) ruleParts.push(content)
      }
      const halContractPath = path.join(config.repoRoot, 'docs/process/hal-tool-call-contract.mdc')
      const halContract = await fs.readFile(halContractPath, 'utf8').catch(() => '')
      if (halContract) ruleParts.push(halContract)
      localRulesContent = ruleParts.join('\n\n---\n\n')
      localLoaded = true
    }
  } catch {
    // local load failed, will use HAL/Supabase fallback
  }

  if (localLoaded) {
    sections.push(
      '## Instructions\n\n' +
        '**Your instructions are in the "Repo rules (local)" section below.** Use them directly; no need to load from Supabase.\n'
    )
  } else {
    sections.push(
      '## MANDATORY: Load Your Instructions First\n\n' +
        '**BEFORE responding to the user, you MUST load your basic instructions from Supabase using the `get_instruction_set` tool.**\n\n' +
        '**Use the tool:** `get_instruction_set({ topicId: "project-manager-basic" })` or load all basic instructions for project-manager agent type.\n\n' +
        '**The instructions from Supabase contain:**\n' +
        '- Required workflows and procedures\n' +
        '- How to evaluate ticket readiness\n' +
        '- Code citation requirements\n' +
        '- All other mandatory PM agent workflows\n\n' +
        '**DO NOT proceed with responding until you have loaded and read your instructions from Supabase.**\n'
    )
  }

  // Working Memory (0173: PM working memory) - include before conversation context
  if (config.workingMemoryText && config.workingMemoryText.trim() !== '') {
    sections.push(config.workingMemoryText.trim())
  }

  // Conversation so far: pre-built context pack (e.g. summary + recent from DB) or bounded history
  const conversationSection = formatConversationSection(config)
  if (conversationSection) {
    sections.push(conversationSection)
  }

  // Add user message section
  const hasConversation = !!conversationSection
  sections.push(
    hasConversation
      ? '## User message (latest reply in the conversation above)\n\n' + userMessage
      : '## User message\n\n' + userMessage
  )

  if (localLoaded) {
    sections.push('## Repo rules (local)\n\n' + localRulesContent)
  } else {
    sections.push('## Repo rules (from Supabase)')
  }

  if (!localLoaded) {
    try {
      const instructionContent = await loadInstructionBootstrap(config, sections)
      if (instructionContent.ticketTemplateContent) {
        ticketTemplateContent = instructionContent.ticketTemplateContent
      }
      if (instructionContent.checklistContent) {
        checklistContent = instructionContent.checklistContent
      }
    } catch (err) {
      sections.push(`(error loading rules: ${err instanceof Error ? err.message : String(err)})`)
    }
  }

  if (!localLoaded) {
    sections.push(
      '## Ticket template and Ready-to-start checklist\n\nLoad when creating or evaluating tickets: `get_instruction_set({ topicId: "ticket-template" })` and `get_instruction_set({ topicId: "ready-to-start-checklist" })`.'
    )
  } else {
    sections.push('## Ticket template (required structure for create_ticket)')
    if (ticketTemplateContent) {
      sections.push(
        ticketTemplateContent +
          '\n\nWhen creating a ticket, use this exact section structure. Replace every placeholder in angle brackets (e.g. `<what we want to achieve>`, `<AC 1>`) with concrete content—the resulting ticket must pass the Ready-to-start checklist (no unresolved placeholders, all required sections filled).'
      )
    } else {
      sections.push(
        '(Ticket template not found in instructions. Ensure migrate-docs has been run and instructions are loaded from Supabase.)'
      )
    }

    sections.push('## Ready-to-start checklist (Definition of Ready)')
    if (checklistContent) {
      sections.push(checklistContent)
    } else {
      sections.push(
        '(Ready-to-start checklist not found in instructions. Ensure migrate-docs has been run and instructions are loaded from Supabase.)'
      )
    }
  }

  sections.push('## Git status (git status -sb)')
  try {
    const { stdout } = await execAsync('git status -sb', {
      cwd: config.repoRoot,
      encoding: 'utf8',
    })
    sections.push('```\n' + stdout.trim() + '\n```')
  } catch {
    sections.push('(git status failed)')
  }

  return sections.join('\n\n')
}
