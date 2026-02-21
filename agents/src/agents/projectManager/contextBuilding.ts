/**
 * Context building for PM agent - builds the context pack for the LLM.
 */

import fs from 'fs/promises'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'

export type ConversationTurn = { role: 'user' | 'assistant'; content: string }

export interface PmAgentConfig {
  repoRoot: string
  openaiApiKey: string
  openaiModel: string
  rulesDir?: string
  /** Prior turns for multi-turn context (last N messages). */
  conversationHistory?: ConversationTurn[]
  /** Pre-built "Conversation so far" section (e.g. summary + recent from DB). When set, used instead of conversationHistory. */
  conversationContextPack?: string
  /** Working memory text (0173: PM working memory) - structured context from conversation history. */
  workingMemoryText?: string
  /** OpenAI Responses API: continue from this response for continuity. */
  previousResponseId?: string
  /** Project identifier (e.g. repo full_name when connected via GitHub). */
  projectId?: string
  /** Repo full_name (owner/repo) when connected via GitHub. Enables read_file/search_files via GitHub API. */
  repoFullName?: string
  /** Read file from connected GitHub repo. When set, used instead of local FS for project files. */
  githubReadFile?: (path: string, maxLines?: number) => Promise<{ content: string } | { error: string }>
  /** Search code in connected GitHub repo. When set, used instead of local FS for project search. */
  githubSearchCode?: (
    pattern: string,
    glob?: string
  ) => Promise<{ matches: Array<{ path: string; line: number; text: string }> } | { error: string }>
  /** List directory contents in connected GitHub repo. When set, used instead of local FS for directory listing. */
  githubListDirectory?: (path: string) => Promise<{ entries: string[] } | { error: string }>
  /** Image attachments to include in the request (base64 data URLs). */
  images?: Array<{ dataUrl: string; filename: string; mimeType: string }>
}

const execAsync = promisify(exec)

/** Cap on character count for "recent conversation" so long technical messages don't dominate. (~3k tokens) */
export const CONVERSATION_RECENT_MAX_CHARS = 12_000

/** Use minimal bootstrap to avoid context overflow: do not inline full instruction bodies or long topic index. Agent loads instructions on demand via get_instruction_set. */
export const USE_MINIMAL_BOOTSTRAP = true

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

/** Curated PM rule files for local-first loading. */
export const PM_LOCAL_RULES = [
  'agent-instructions.mdc',
  'ac-confirmation-checklist.mdc',
  'code-citation-requirements.mdc',
  'qa-audit-report.mdc',
] as const

export function formatPmInputsSummary(config: PmAgentConfig): string {
  const hasGitHubRepo =
    typeof config.repoFullName === 'string' && config.repoFullName.trim() !== ''

  const hasConversationContextPack =
    typeof config.conversationContextPack === 'string' &&
    config.conversationContextPack.trim() !== ''

  const hasConversationHistory = Array.isArray(config.conversationHistory) && config.conversationHistory.length > 0

  const hasWorkingMemoryText =
    typeof config.workingMemoryText === 'string' &&
    config.workingMemoryText.trim() !== ''

  const imageCount = Array.isArray(config.images) ? config.images.length : 0
  const openaiModel = String(config.openaiModel ?? '').trim()
  const isVisionModel = openaiModel.includes('vision') || openaiModel.includes('gpt-4o')

  const availableTools: Array<{ name: string; available: boolean }> = [
    { name: 'get_instruction_set', available: true },
    { name: 'list_directory', available: true },
    { name: 'read_file', available: true },
    { name: 'search_files', available: true },
    { name: 'evaluate_ticket_ready', available: true },
    // Ticket tools are always available; they call HAL API endpoints.
    { name: 'create_ticket', available: true },
    { name: 'fetch_ticket_content', available: true },
    { name: 'update_ticket_body', available: true },
    { name: 'kanban_move_ticket_to_todo', available: true },
    { name: 'list_tickets_by_column', available: true },
    { name: 'move_ticket_to_column', available: true },
    { name: 'list_available_repos', available: true },
    // Tools currently present but intentionally disabled (require missing HAL endpoints).
    { name: 'sync_tickets', available: false },
    { name: 'kanban_move_ticket_to_other_repo_todo', available: false },
    { name: 'attach_image_to_ticket', available: false },
  ]

  const enabledTools = availableTools.filter((t) => t.available).map((t) => `- ${t.name}`)
  const disabledTools = availableTools
    .filter((t) => !t.available)
    .map((t) => `- ${t.name}`)

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
    `- **ticket operations**: HAL API only (no direct DB access from agents)`,
    `- **conversation context**: ${conversationSource}`,
    `- **working memory**: ${hasWorkingMemoryText ? 'present' : 'absent'}`,
    `- **images**: ${imageCount} (${imageCount > 0 ? (isVisionModel ? 'included' : 'ignored by model') : 'none'})`,
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

interface LocalLoadResult {
  localLoaded: boolean
  ticketTemplateContent: string | null
  checklistContent: string | null
  localRulesContent: string
}

async function loadLocalRules(
  repoRoot: string,
  rulesPath: string
): Promise<LocalLoadResult> {
  const result: LocalLoadResult = {
    localLoaded: false,
    ticketTemplateContent: null,
    checklistContent: null,
    localRulesContent: '',
  }

  try {
    const templatePath = path.join(repoRoot, 'docs/templates/ticket.template.md')
    const templateAltPath = path.join(
      repoRoot,
      'projects/kanban/docs/templates/ticket.template.md'
    )
    const checklistPath = path.join(repoRoot, 'docs/process/ready-to-start-checklist.md')

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
      result.ticketTemplateContent = templateContent
      result.checklistContent = checklistRead
      const ruleParts: string[] = [agentInstructions]
      for (const name of PM_LOCAL_RULES) {
        if (name === 'agent-instructions.mdc') continue
        const content = await fs.readFile(path.join(rulesPath, name), 'utf8').catch(() => '')
        if (content) ruleParts.push(content)
      }
      const halContractPath = path.join(repoRoot, 'docs/process/hal-tool-call-contract.mdc')
      const halContract = await fs.readFile(halContractPath, 'utf8').catch(() => '')
      if (halContract) ruleParts.push(halContract)
      result.localRulesContent = ruleParts.join('\n\n---\n\n')
      result.localLoaded = true
    }
  } catch {
    // local load failed, will use HAL/Supabase fallback
  }

  return result
}

function formatConversationSection(config: PmAgentConfig): { section: string; hasConversation: boolean } {
  if (config.conversationContextPack && config.conversationContextPack.trim() !== '') {
    return {
      section: '## Conversation so far\n\n' + config.conversationContextPack.trim(),
      hasConversation: true,
    }
  }

  const history = config.conversationHistory
  if (history && history.length > 0) {
    const { recent, omitted } = recentTurnsWithinCharBudget(history, CONVERSATION_RECENT_MAX_CHARS)
    const truncNote =
      omitted > 0
        ? `\n(older messages omitted; showing recent conversation within ${CONVERSATION_RECENT_MAX_CHARS.toLocaleString()} characters)\n\n`
        : '\n\n'
    const lines = recent.map((t) => `**${t.role}**: ${t.content}`)
    return {
      section: '## Conversation so far' + truncNote + lines.join('\n\n'),
      hasConversation: true,
    }
  }

  return { section: '', hasConversation: false }
}

type TopicMeta = {
  title?: string
  description?: string
  agentTypes?: string[]
  keywords?: string[]
}

type InstructionRecord = {
  topicId: string
  filename: string
  title: string
  description: string
  contentMd: string
  alwaysApply: boolean
  agentTypes: string[]
  isBasic: boolean
  isSituational: boolean
  topicMetadata?: TopicMeta
}

const AGENT_TYPES = [
  'project-manager',
  'implementation-agent',
  'qa-agent',
  'process-review-agent',
] as const

function labelForAgentType(agentType: (typeof AGENT_TYPES)[number]): string {
  if (agentType === 'project-manager') return 'Project Manager'
  if (agentType === 'implementation-agent') return 'Implementation Agent'
  if (agentType === 'qa-agent') return 'QA Agent'
  return 'Process Review Agent'
}

function mapHalInstruction(raw: Record<string, unknown>): InstructionRecord {
  const topicIdRaw = typeof raw.topicId === 'string' ? raw.topicId.trim() : ''
  const filenameRaw = typeof raw.filename === 'string' ? raw.filename.trim() : ''
  const titleRaw = typeof raw.title === 'string' ? raw.title.trim() : ''
  const descriptionRaw = typeof raw.description === 'string' ? raw.description.trim() : ''
  const contentMdRaw =
    typeof raw.contentMd === 'string'
      ? raw.contentMd
      : typeof raw.contentBody === 'string'
        ? raw.contentBody
        : ''
  const topicMeta = raw.topicMetadata as TopicMeta | undefined
  const agentTypesRaw = Array.isArray(raw.agentTypes)
    ? raw.agentTypes.filter((v): v is string => typeof v === 'string')
    : []

  const topicId = topicIdRaw || filenameRaw.replace(/\.mdc$/i, '')
  const filename = filenameRaw || `${topicId || 'unknown'}.mdc`
  return {
    topicId,
    filename,
    title: titleRaw || filename.replace(/\.mdc$/i, '').replace(/-/g, ' '),
    description: descriptionRaw || topicMeta?.description || 'No description',
    contentMd: contentMdRaw,
    alwaysApply: raw.alwaysApply === true,
    agentTypes: agentTypesRaw,
    isBasic: raw.isBasic === true,
    isSituational: raw.isSituational === true,
    topicMetadata: topicMeta,
  }
}

function appliesToAllAgents(inst: InstructionRecord): boolean {
  return inst.alwaysApply || inst.agentTypes.includes('all')
}

function appliesToAgent(inst: InstructionRecord, agentType: string): boolean {
  return appliesToAllAgents(inst) || inst.agentTypes.includes(agentType)
}

function dedupeTopicSummaries(
  entries: Array<{ id: string; title: string; description: string }>
): Array<{ id: string; title: string; description: string }> {
  const seen = new Set<string>()
  const unique: Array<{ id: string; title: string; description: string }> = []
  for (const entry of entries) {
    if (!entry.id || seen.has(entry.id)) continue
    seen.add(entry.id)
    unique.push(entry)
  }
  return unique.sort((a, b) => a.id.localeCompare(b.id))
}

function appendMinimalBootstrap(sections: string[]): void {
  sections.push(
    'Instructions are stored in Supabase. **Load your full PM instructions first:** `get_instruction_set({ agentType: "project-manager" })`. '
  )
  sections.push(
    'For ticket creation or readiness checks, load `get_instruction_set({ topicId: "ticket-template" })` and `get_instruction_set({ topicId: "ready-to-start-checklist" })`.\n'
  )
  sections.push('**Request a topic by ID:** `get_instruction_set({ topicId: "<topic-id>" })`.')
}

function appendInstructionWorkflow(sections: string[], basicInstructions: InstructionRecord[]): void {
  sections.push('### Instruction loading workflow\n')
  sections.push('1. Start with the global bootstrap instructions (all agents).')
  sections.push('2. Request the full instruction set for the active agent type.')
  sections.push('3. Request additional topic-specific instructions only when needed.\n')

  sections.push('**Request full instruction set by agent type:**')
  for (const agentType of AGENT_TYPES) {
    const agentBasicCount = basicInstructions.filter(
      (inst) => inst.agentTypes.includes(agentType) && !inst.agentTypes.includes('all')
    ).length
    sections.push(
      `- \`${agentType}\` (${agentBasicCount} basic instruction${agentBasicCount === 1 ? '' : 's'}): \`get_instruction_set({ agentType: "${agentType}" })\``
    )
  }
}

function appendSharedTopics(sections: string[], sharedSituational: Array<{ id: string; title: string; description: string }>): void {
  if (sharedSituational.length === 0) return
  sections.push('\n**Less-common shared topics (all agents):**')
  for (const topic of sharedSituational) {
    sections.push(`- **${topic.title}** (ID: \`${topic.id}\`): ${topic.description}`)
  }
}

function appendAgentTopics(sections: string[], situationalInstructions: InstructionRecord[]): void {
  for (const agentType of AGENT_TYPES) {
    const agentTopics = dedupeTopicSummaries(
      situationalInstructions
        .filter((inst) => appliesToAgent(inst, agentType))
        .map((inst) => ({
          id: inst.topicId,
          title: inst.topicMetadata?.title || inst.title,
          description: inst.topicMetadata?.description || inst.description,
        }))
    )
    if (agentTopics.length === 0) continue

    sections.push(`\n**Additional topics for ${labelForAgentType(agentType)}:**`)
    for (const topic of agentTopics) {
      sections.push(`- **${topic.title}** (ID: \`${topic.id}\`): ${topic.description}`)
    }
  }
}

function appendInstructionBootstrap(
  sections: string[],
  sourceLabel: string,
  basicInstructions: InstructionRecord[],
  situationalInstructions: InstructionRecord[],
  minimalBootstrap: boolean
): boolean {
  if (basicInstructions.length === 0 && situationalInstructions.length === 0) {
    return false
  }

  sections.push(`### Global bootstrap instructions (${sourceLabel})\n`)

  if (minimalBootstrap) {
    appendMinimalBootstrap(sections)
    return true
  }

  const globalBasic = basicInstructions.filter(appliesToAllAgents)
  if (globalBasic.length === 0) {
    sections.push('_No global bootstrap instruction bodies were found._')
  } else {
    for (const inst of globalBasic) {
      sections.push(`#### ${inst.filename}\n\n${inst.contentMd}\n`)
    }
  }

  const sharedSituational = dedupeTopicSummaries(
    situationalInstructions
      .filter(appliesToAllAgents)
      .map((inst) => ({
        id: inst.topicId,
        title: inst.topicMetadata?.title || inst.title,
        description: inst.topicMetadata?.description || inst.description,
      }))
  )

  appendInstructionWorkflow(sections, basicInstructions)
  appendSharedTopics(sections, sharedSituational)
  appendAgentTopics(sections, situationalInstructions)

  sections.push('\n**Request a specific topic directly:** `get_instruction_set({ topicId: "<topic-id>" })`.')
  return true
}

async function loadInstructionsFromHalApi(
  sections: string[],
  repoRoot: string,
  repoFullName: string
): Promise<{ ticketTemplateContent: string | null; checklistContent: string | null }> {
  let halBaseUrl: string | null = null
  try {
    const apiBaseUrlPath = path.join(repoRoot, '.hal', 'api-base-url')
    const apiBaseUrlContent = await fs.readFile(apiBaseUrlPath, 'utf8')
    halBaseUrl = apiBaseUrlContent.trim()
  } catch {
    // .hal/api-base-url not found
  }

  let ticketTemplateContent: string | null = null
  let checklistContent: string | null = null

  if (halBaseUrl) {
    try {
      const [basicRes, situationalRes] = await Promise.all([
        fetch(`${halBaseUrl}/api/instructions/get`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            repoFullName,
            includeBasic: true,
            includeSituational: false,
          }),
        }),
        fetch(`${halBaseUrl}/api/instructions/get`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            repoFullName,
            includeBasic: false,
            includeSituational: true,
          }),
        }),
      ])

      const basicInstructions: InstructionRecord[] = []
      const situationalInstructions: InstructionRecord[] = []

      if (basicRes.ok) {
        const basicData = (await basicRes.json()) as {
          success?: boolean
          instructions?: Array<Record<string, unknown>>
        }
        if (basicData.success && Array.isArray(basicData.instructions)) {
          basicInstructions.push(...basicData.instructions.map(mapHalInstruction))
        }
      }

      if (situationalRes.ok) {
        const situationalData = (await situationalRes.json()) as {
          success?: boolean
          instructions?: Array<Record<string, unknown>>
        }
        if (situationalData.success && Array.isArray(situationalData.instructions)) {
          situationalInstructions.push(...situationalData.instructions.map(mapHalInstruction))
        }
      }

      appendInstructionBootstrap(
        sections,
        'HAL API',
        basicInstructions,
        situationalInstructions,
        USE_MINIMAL_BOOTSTRAP
      )
      const templateInst = basicInstructions.find((i) => i.topicId === 'ticket-template')
      const checklistInst = basicInstructions.find((i) => i.topicId === 'ready-to-start-checklist')
      if (templateInst?.contentMd) ticketTemplateContent = templateInst.contentMd
      if (checklistInst?.contentMd) checklistContent = checklistInst.contentMd
    } catch (apiErr) {
      console.warn('[PM Agent] HAL API instruction bootstrap failed:', apiErr)
    }
  }

  return { ticketTemplateContent, checklistContent }
}

export async function buildContextPack(config: PmAgentConfig, userMessage: string): Promise<string> {
  const rulesDir = config.rulesDir ?? '.cursor/rules'
  const rulesPath = path.resolve(config.repoRoot, rulesDir)

  const sections: string[] = []

  // Always include a compact list of HAL-provided inputs and enabled tools (helps debugging while keeping context small).
  sections.push(formatPmInputsSummary(config))

  // Local-first: try loading rules from repo
  const localLoadResult = await loadLocalRules(config.repoRoot, rulesPath)

  if (localLoadResult.localLoaded) {
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
  if (conversationSection.hasConversation) {
    sections.push(conversationSection.section)
  }

  if (conversationSection.hasConversation) {
    sections.push('## User message (latest reply in the conversation above)\n\n' + userMessage)
  } else {
    sections.push('## User message\n\n' + userMessage)
  }

  if (localLoadResult.localLoaded) {
    sections.push('## Repo rules (local)\n\n' + localLoadResult.localRulesContent)
  } else {
    sections.push('## Repo rules (from Supabase)')
  }

  let ticketTemplateContent = localLoadResult.ticketTemplateContent
  let checklistContent = localLoadResult.checklistContent

  if (!localLoadResult.localLoaded) {
    try {
      const repoFullName = config.repoFullName || config.projectId || 'beardedphil/portfolio-2026-hal'
      const halResult = await loadInstructionsFromHalApi(sections, config.repoRoot, repoFullName)
      if (halResult.ticketTemplateContent) ticketTemplateContent = halResult.ticketTemplateContent
      if (halResult.checklistContent) checklistContent = halResult.checklistContent

      // Last resort: local entry point only (no topic content from filesystem).
      if (!sections.some((s) => s.includes('Global bootstrap instructions'))) {
        try {
          const entryPointPath = path.join(rulesPath, 'agent-instructions.mdc')
          const entryPointContent = await fs.readFile(entryPointPath, 'utf8')
          sections.push('### Agent Instructions Entry Point (filesystem fallback)\n\n')
          sections.push(entryPointContent)
          sections.push(
            '\n\n**Note:** This fallback is entry-point only. Individual instruction sets and topics are loaded from HAL/Supabase, not local files.'
          )
        } catch {
          sections.push('### Agent Instructions\n\n')
          sections.push(
            '**Error:** Could not load instruction bootstrap from HAL/Supabase or the local entry-point fallback.\n'
          )
          sections.push('**To access instructions:**\n')
          sections.push('- Use HAL API endpoint `/api/instructions/get` to fetch bootstrap/basic instructions\n')
          sections.push('- Use `get_instruction_set({ agentType: "<agent-type>" })` for full agent instruction sets\n')
          sections.push('- Use HAL API endpoint `/api/instructions/get-topic` (or `get_instruction_set({ topicId })`) for specific topics\n')
        }
      }
    } catch (err) {
      sections.push(`(error loading rules: ${err instanceof Error ? err.message : String(err)})`)
    }
  }

  appendTicketTemplateSection(sections, localLoadResult.localLoaded, ticketTemplateContent, checklistContent)

  await appendGitStatusSection(sections, config.repoRoot)

  return sections.join('\n\n')
}

function appendTicketTemplateSection(
  sections: string[],
  localLoaded: boolean,
  ticketTemplateContent: string | null,
  checklistContent: string | null
): void {
  if (!localLoaded && USE_MINIMAL_BOOTSTRAP) {
    sections.push(
      '## Ticket template and Ready-to-start checklist\n\nLoad when creating or evaluating tickets: `get_instruction_set({ topicId: "ticket-template" })` and `get_instruction_set({ topicId: "ready-to-start-checklist" })`.'
    )
    return
  }

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

async function appendGitStatusSection(sections: string[], repoRoot: string): Promise<void> {
  sections.push('## Git status (git status -sb)')
  try {
    const { stdout } = await execAsync('git status -sb', {
      cwd: repoRoot,
      encoding: 'utf8',
    })
    sections.push('```\n' + stdout.trim() + '\n```')
  } catch {
    sections.push('(git status failed)')
  }
}
