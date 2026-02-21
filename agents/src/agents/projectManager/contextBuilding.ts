/**
 * Context building for PM agent - builds the context pack for the LLM.
 */

import fs from 'fs/promises'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import { createClient } from '@supabase/supabase-js'

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
  /** Legacy: optional direct Supabase creds (only used for instruction bootstrap fallback). */
  supabaseUrl?: string
  supabaseAnonKey?: string
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

function hasNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== ''
}

function hasNonEmptyArray<T>(value: unknown): value is T[] {
  return Array.isArray(value) && value.length > 0
}

function isVisionModel(model: string): boolean {
  return model.includes('vision') || model.includes('gpt-4o')
}

function getConversationSource(
  hasContextPack: boolean,
  hasHistory: boolean
): string {
  if (hasContextPack) return 'conversationContextPack (DB-derived)'
  if (hasHistory) return 'conversationHistory (client-provided)'
  return 'none'
}

function buildToolList(imageCount: number): Array<{ name: string; available: boolean }> {
  return [
    { name: 'get_instruction_set', available: true },
    { name: 'list_directory', available: true },
    { name: 'read_file', available: true },
    { name: 'search_files', available: true },
    { name: 'evaluate_ticket_ready', available: true },
    // Ticket operations are endpoint-only (HAL API); no direct Supabase creds required in the PM agent runtime.
    { name: 'create_ticket', available: true },
    { name: 'fetch_ticket_content', available: true },
    { name: 'update_ticket_body', available: true },
    { name: 'create_red_document_v2', available: true },
    { name: 'sync_tickets', available: true },
    { name: 'kanban_move_ticket_to_todo', available: true },
    { name: 'list_tickets_by_column', available: true },
    { name: 'move_ticket_to_column', available: true },
    { name: 'list_available_repos', available: true },
    { name: 'kanban_move_ticket_to_other_repo_todo', available: true },
    // Image attachment is still gated by having an image in the message, but the endpoint is not implemented yet.
    { name: 'attach_image_to_ticket', available: imageCount > 0 },
  ]
}

export function formatPmInputsSummary(config: PmAgentConfig): string {
  const hasGitHubRepo = hasNonEmptyString(config.repoFullName)
  const hasConversationContextPack = hasNonEmptyString(config.conversationContextPack)
  const hasConversationHistory = hasNonEmptyArray<ConversationTurn>(config.conversationHistory)
  const hasWorkingMemoryText = hasNonEmptyString(config.workingMemoryText)
  const hasSupabaseClientCreds = hasNonEmptyString(config.supabaseUrl) && hasNonEmptyString(config.supabaseAnonKey)

  const imageCount = hasNonEmptyArray(config.images) ? config.images.length : 0
  const openaiModel = String(config.openaiModel ?? '').trim()
  const modelIsVision = isVisionModel(openaiModel)

  const availableTools = buildToolList(imageCount)
  const enabledTools = availableTools.filter((t) => t.available).map((t) => `- ${t.name}`)
  const disabledTools = availableTools.filter((t) => !t.available).map((t) => `- ${t.name}`)

  const conversationSource = getConversationSource(hasConversationContextPack, hasConversationHistory)
  const halApiBaseUrl = (process.env.HAL_API_BASE_URL || process.env.APP_ORIGIN || 'https://portfolio-2026-hal.vercel.app').trim()

  const lines: string[] = [
    '## Inputs (provided by HAL)',
    '',
    `- **repoFullName**: ${hasGitHubRepo ? config.repoFullName!.trim() : '(not provided)'}`,
    `- **repoRoot**: ${String(config.repoRoot ?? '').trim() || '(not provided)'}`,
    `- **openaiModel**: ${openaiModel || '(not provided)'}`,
    `- **previousResponseId**: ${String(config.previousResponseId ?? '').trim() ? 'present' : 'absent'}`,
    `- **HAL API base URL**: ${halApiBaseUrl || '(not provided)'}`,
    `- **supabase client creds (legacy)**: ${hasSupabaseClientCreds ? 'present (bootstrap fallback only)' : 'absent'}`,
    `- **conversation context**: ${conversationSource}`,
    `- **working memory**: ${hasWorkingMemoryText ? 'present' : 'absent'}`,
    `- **images**: ${imageCount} (${imageCount > 0 ? (modelIsVision ? 'included' : 'ignored by model') : 'none'})`,
    '',
    '## Tools available (this run)',
    '',
    ...(enabledTools.length > 0 ? enabledTools : ['- (none)']),
    '',
    ...(disabledTools.length > 0 ? ['## Tools not available (not enabled in this run)', '', ...disabledTools] : []),
  ]

  return lines.join('\n')
}

function addConversationSection(
  sections: string[],
  config: PmAgentConfig
): boolean {
  if (hasNonEmptyString(config.conversationContextPack)) {
    sections.push('## Conversation so far\n\n' + (config.conversationContextPack ?? '').trim())
    return true
  }

  if (hasNonEmptyArray<ConversationTurn>(config.conversationHistory)) {
    const { recent, omitted } = recentTurnsWithinCharBudget(
      config.conversationHistory,
      CONVERSATION_RECENT_MAX_CHARS
    )
    const truncNote =
      omitted > 0
        ? `\n(older messages omitted; showing recent conversation within ${CONVERSATION_RECENT_MAX_CHARS.toLocaleString()} characters)\n\n`
        : '\n\n'
    const lines = recent.map((t) => `**${t.role}**: ${t.content}`)
    sections.push('## Conversation so far' + truncNote + lines.join('\n\n'))
    return true
  }

  return false
}

async function tryLoadLocalRules(
  repoRoot: string,
  rulesPath: string
): Promise<{
  localLoaded: boolean
  ticketTemplateContent: string | null
  checklistContent: string | null
  localRulesContent: string
}> {
  let ticketTemplateContent: string | null = null
  let checklistContent: string | null = null
  let localRulesContent = ''

  try {
    const templatePath = path.join(repoRoot, 'docs/templates/ticket.template.md')
    const templateAltPath = path.join(repoRoot, 'projects/kanban/docs/templates/ticket.template.md')
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
      const halContractPath = path.join(repoRoot, 'docs/process/hal-tool-call-contract.mdc')
      const halContract = await fs.readFile(halContractPath, 'utf8').catch(() => '')
      if (halContract) ruleParts.push(halContract)
      localRulesContent = ruleParts.join('\n\n---\n\n')
      return { localLoaded: true, ticketTemplateContent, checklistContent, localRulesContent }
    }
  } catch {
    // local load failed, will use HAL/Supabase fallback
  }

  return { localLoaded: false, ticketTemplateContent, checklistContent, localRulesContent }
}

export async function buildContextPack(config: PmAgentConfig, userMessage: string): Promise<string> {
  const rulesDir = config.rulesDir ?? '.cursor/rules'
  const rulesPath = path.resolve(config.repoRoot, rulesDir)

  const sections: string[] = []

  // Always include a compact list of HAL-provided inputs and enabled tools (helps debugging while keeping context small).
  sections.push(formatPmInputsSummary(config))

  // Local-first: try loading rules from repo
  const localRulesResult = await tryLoadLocalRules(config.repoRoot, rulesPath)
  let { localLoaded, ticketTemplateContent, checklistContent, localRulesContent } = localRulesResult

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
  if (hasNonEmptyString(config.workingMemoryText)) {
    sections.push((config.workingMemoryText ?? '').trim())
  }

  // Conversation so far: pre-built context pack (e.g. summary + recent from DB) or bounded history
  const hasConversation = addConversationSection(sections, config)

  if (hasConversation) {
    sections.push('## User message (latest reply in the conversation above)\n\n' + userMessage)
  } else {
    sections.push('## User message\n\n' + userMessage)
  }

  if (localLoaded) {
    sections.push('## Repo rules (local)\n\n' + localRulesContent)
  } else {
    sections.push('## Repo rules (from Supabase)')
  }

  if (!localLoaded) {
  try {
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

    const repoFullName = config.repoFullName || config.projectId || 'beardedphil/portfolio-2026-hal'
    const agentTypes = [
      'project-manager',
      'implementation-agent',
      'qa-agent',
      'process-review-agent',
    ] as const

    const labelForAgentType = (agentType: (typeof agentTypes)[number]): string => {
      if (agentType === 'project-manager') return 'Project Manager'
      if (agentType === 'implementation-agent') return 'Implementation Agent'
      if (agentType === 'qa-agent') return 'QA Agent'
      return 'Process Review Agent'
    }

    const mapHalInstruction = (raw: Record<string, unknown>): InstructionRecord => {
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

    const mapSupabaseInstruction = (raw: Record<string, unknown>): InstructionRecord => {
      const topicIdRaw = typeof raw.topic_id === 'string' ? raw.topic_id.trim() : ''
      const filenameRaw = typeof raw.filename === 'string' ? raw.filename.trim() : ''
      const titleRaw = typeof raw.title === 'string' ? raw.title.trim() : ''
      const descriptionRaw = typeof raw.description === 'string' ? raw.description.trim() : ''
      const contentMdRaw =
        typeof raw.content_md === 'string'
          ? raw.content_md
          : typeof raw.content_body === 'string'
            ? raw.content_body
            : ''
      const topicMeta = raw.topic_metadata as TopicMeta | undefined
      const agentTypesRaw = Array.isArray(raw.agent_types)
        ? raw.agent_types.filter((v): v is string => typeof v === 'string')
        : []

      const topicId = topicIdRaw || filenameRaw.replace(/\.mdc$/i, '')
      const filename = filenameRaw || `${topicId || 'unknown'}.mdc`
      return {
        topicId,
        filename,
        title: titleRaw || filename.replace(/\.mdc$/i, '').replace(/-/g, ' '),
        description: descriptionRaw || topicMeta?.description || 'No description',
        contentMd: contentMdRaw,
        alwaysApply: raw.always_apply === true,
        agentTypes: agentTypesRaw,
        isBasic: raw.is_basic === true,
        isSituational: raw.is_situational === true,
        topicMetadata: topicMeta,
      }
    }

    const appliesToAllAgents = (inst: InstructionRecord): boolean =>
      inst.alwaysApply || inst.agentTypes.includes('all')

    const appliesToAgent = (inst: InstructionRecord, agentType: string): boolean =>
      appliesToAllAgents(inst) || inst.agentTypes.includes(agentType)

    const dedupeTopicSummaries = (
      entries: Array<{ id: string; title: string; description: string }>
    ): Array<{ id: string; title: string; description: string }> => {
      const seen = new Set<string>()
      const unique: Array<{ id: string; title: string; description: string }> = []
      for (const entry of entries) {
        if (!entry.id || seen.has(entry.id)) continue
        seen.add(entry.id)
        unique.push(entry)
      }
      return unique.sort((a, b) => a.id.localeCompare(b.id))
    }

    const appendInstructionBootstrap = (
      sourceLabel: string,
      basicInstructions: InstructionRecord[],
      situationalInstructions: InstructionRecord[],
      minimalBootstrap: boolean
    ): boolean => {
      const globalBasic = basicInstructions.filter(appliesToAllAgents)

      if (basicInstructions.length === 0 && situationalInstructions.length === 0) {
        return false
      }

      sections.push(`### Global bootstrap instructions (${sourceLabel})\n`)

      if (minimalBootstrap) {
        sections.push(
          'Instructions are stored in Supabase. **Load your full PM instructions first:** `get_instruction_set({ agentType: "project-manager" })`. '
        )
        sections.push(
          'For ticket creation or readiness checks, load `get_instruction_set({ topicId: "ticket-template" })` and `get_instruction_set({ topicId: "ready-to-start-checklist" })`.\n'
        )
        sections.push(
          '**Request a topic by ID:** `get_instruction_set({ topicId: "<topic-id>" })`.'
        )
        return true
      }

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

      sections.push('### Instruction loading workflow\n')
      sections.push('1. Start with the global bootstrap instructions (all agents).')
      sections.push('2. Request the full instruction set for the active agent type.')
      sections.push('3. Request additional topic-specific instructions only when needed.\n')

      sections.push('**Request full instruction set by agent type:**')
      for (const agentType of agentTypes) {
        const agentBasicCount = basicInstructions.filter(
          (inst) => inst.agentTypes.includes(agentType) && !inst.agentTypes.includes('all')
        ).length
        sections.push(
          `- \`${agentType}\` (${agentBasicCount} basic instruction${agentBasicCount === 1 ? '' : 's'}): \`get_instruction_set({ agentType: "${agentType}" })\``
        )
      }

      if (sharedSituational.length > 0) {
        sections.push('\n**Less-common shared topics (all agents):**')
        for (const topic of sharedSituational) {
          sections.push(
            `- **${topic.title}** (ID: \`${topic.id}\`): ${topic.description}`
          )
        }
      }

      for (const agentType of agentTypes) {
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
          sections.push(
            `- **${topic.title}** (ID: \`${topic.id}\`): ${topic.description}`
          )
        }
      }

      sections.push(
        '\n**Request a specific topic directly:** `get_instruction_set({ topicId: "<topic-id>" })`.'
      )
      return true
    }

    let bootstrapLoaded = false

    // HAL API is the primary path.
    let halBaseUrl: string | null = null
    try {
      const apiBaseUrlPath = path.join(config.repoRoot, '.hal', 'api-base-url')
      const apiBaseUrlContent = await fs.readFile(apiBaseUrlPath, 'utf8')
      halBaseUrl = apiBaseUrlContent.trim()
    } catch {
      // .hal/api-base-url not found, will try direct Supabase fallback.
    }

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

        bootstrapLoaded = appendInstructionBootstrap(
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

    // Direct Supabase fallback if HAL bootstrap loading failed.
    if (!bootstrapLoaded && config.supabaseUrl && config.supabaseAnonKey) {
      const supabase = createClient(config.supabaseUrl.trim(), config.supabaseAnonKey.trim())
      const [basicQuery, situationalQuery] = await Promise.all([
        supabase
          .from('agent_instructions')
          .select('*')
          .eq('repo_full_name', repoFullName)
          .eq('is_basic', true)
          .order('filename'),
        supabase
          .from('agent_instructions')
          .select('*')
          .eq('repo_full_name', repoFullName)
          .eq('is_situational', true)
          .order('filename'),
      ])

      const basicInstructions: InstructionRecord[] =
        !basicQuery.error && Array.isArray(basicQuery.data)
          ? basicQuery.data.map((row) => mapSupabaseInstruction(row as Record<string, unknown>))
          : []
      const situationalInstructions: InstructionRecord[] =
        !situationalQuery.error && Array.isArray(situationalQuery.data)
          ? situationalQuery.data.map((row) =>
              mapSupabaseInstruction(row as Record<string, unknown>)
            )
          : []

      bootstrapLoaded = appendInstructionBootstrap(
        'Direct Supabase fallback',
        basicInstructions,
        situationalInstructions,
        USE_MINIMAL_BOOTSTRAP
      )
      const templateInst = basicInstructions.find((i) => i.topicId === 'ticket-template')
      const checklistInst = basicInstructions.find((i) => i.topicId === 'ready-to-start-checklist')
      if (templateInst?.contentMd) ticketTemplateContent = templateInst.contentMd
      if (checklistInst?.contentMd) checklistContent = checklistInst.contentMd
    }

    // Last resort: local entry point only (no topic content from filesystem).
    if (!bootstrapLoaded) {
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

  if (!localLoaded && USE_MINIMAL_BOOTSTRAP) {
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
