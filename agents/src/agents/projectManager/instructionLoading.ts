/**
 * Instruction loading utilities for PM agent context pack.
 */

import fs from 'fs/promises'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import type { PmAgentConfig } from './types.js'

/** Use minimal bootstrap to avoid context overflow: do not inline full instruction bodies or long topic index. Agent loads instructions on demand via get_instruction_set. */
const USE_MINIMAL_BOOTSTRAP = true

/**
 * Types for instruction records.
 */
export type TopicMeta = {
  title?: string
  description?: string
  agentTypes?: string[]
  keywords?: string[]
}

export type InstructionRecord = {
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

/**
 * Maps a HAL API instruction record to InstructionRecord format.
 */
export function mapHalInstruction(raw: Record<string, unknown>): InstructionRecord {
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

/**
 * Maps a Supabase instruction record to InstructionRecord format.
 */
export function mapSupabaseInstruction(raw: Record<string, unknown>): InstructionRecord {
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

/**
 * Checks if an instruction applies to all agents.
 */
export function appliesToAllAgents(inst: InstructionRecord): boolean {
  return inst.alwaysApply || inst.agentTypes.includes('all')
}

/**
 * Checks if an instruction applies to a specific agent type.
 */
export function appliesToAgent(inst: InstructionRecord, agentType: string): boolean {
  return appliesToAllAgents(inst) || inst.agentTypes.includes(agentType)
}

/**
 * Deduplicates topic summaries by ID.
 */
export function dedupeTopicSummaries(
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

/**
 * Gets the label for an agent type.
 */
export function labelForAgentType(agentType: string): string {
  if (agentType === 'project-manager') return 'Project Manager'
  if (agentType === 'implementation-agent') return 'Implementation Agent'
  if (agentType === 'qa-agent') return 'QA Agent'
  return 'Process Review Agent'
}

/**
 * Appends instruction bootstrap content to sections.
 */
export function appendInstructionBootstrap(
  sections: string[],
  sourceLabel: string,
  basicInstructions: InstructionRecord[],
  situationalInstructions: InstructionRecord[],
  agentTypes: readonly string[],
  minimalBootstrap: boolean
): boolean {
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
    sections.push('**Request a topic by ID:** `get_instruction_set({ topicId: "<topic-id>" })`.')
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
      sections.push(`- **${topic.title}** (ID: \`${topic.id}\`): ${topic.description}`)
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
      sections.push(`- **${topic.title}** (ID: \`${topic.id}\`): ${topic.description}`)
    }
  }

  sections.push('\n**Request a specific topic directly:** `get_instruction_set({ topicId: "<topic-id>" })`.')
  return true
}

/**
 * Loads instruction bootstrap from HAL API or Supabase.
 * @returns Object with ticketTemplateContent and checklistContent
 */
export async function loadInstructionBootstrap(
  config: PmAgentConfig,
  sections: string[]
): Promise<{ ticketTemplateContent: string | null; checklistContent: string | null }> {
  const repoFullName = config.repoFullName || config.projectId || 'beardedphil/portfolio-2026-hal'
  const agentTypes = ['project-manager', 'implementation-agent', 'qa-agent', 'process-review-agent'] as const
  const rulesPath = path.resolve(config.repoRoot, config.rulesDir ?? '.cursor/rules')

  let bootstrapLoaded = false

  // Try HAL API first
  let halBaseUrl: string | null = null
  try {
    const apiBaseUrlPath = path.join(config.repoRoot, '.hal', 'api-base-url')
    const apiBaseUrlContent = await fs.readFile(apiBaseUrlPath, 'utf8')
    halBaseUrl = apiBaseUrlContent.trim()
  } catch {
    // .hal/api-base-url not found, will try direct Supabase fallback
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
        sections,
        'HAL API',
        basicInstructions,
        situationalInstructions,
        agentTypes,
        USE_MINIMAL_BOOTSTRAP
      )
      const templateInst = basicInstructions.find((i) => i.topicId === 'ticket-template')
      const checklistInst = basicInstructions.find((i) => i.topicId === 'ready-to-start-checklist')
      const result = {
        ticketTemplateContent: templateInst?.contentMd ?? null,
        checklistContent: checklistInst?.contentMd ?? null,
      }
      if (bootstrapLoaded) return result
    } catch (apiErr) {
      console.warn('[PM Agent] HAL API instruction bootstrap failed:', apiErr)
    }
  }

  // Direct Supabase fallback if HAL bootstrap loading failed
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
        ? situationalQuery.data.map((row) => mapSupabaseInstruction(row as Record<string, unknown>))
        : []

    bootstrapLoaded = appendInstructionBootstrap(
      sections,
      'Direct Supabase fallback',
      basicInstructions,
      situationalInstructions,
      agentTypes,
      USE_MINIMAL_BOOTSTRAP
    )
    const templateInst = basicInstructions.find((i) => i.topicId === 'ticket-template')
    const checklistInst = basicInstructions.find((i) => i.topicId === 'ready-to-start-checklist')
    const result = {
      ticketTemplateContent: templateInst?.contentMd ?? null,
      checklistContent: checklistInst?.contentMd ?? null,
    }
    if (bootstrapLoaded) return result
  }

  // Last resort: local entry point only
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

  return { ticketTemplateContent: null, checklistContent: null }
}
