/**
 * Instruction loading tools for PM agent.
 */

import { tool } from 'ai'
import { z } from 'zod'
import path from 'path'
import fs from 'fs/promises'
import type { ToolCallRecord } from '../../projectManager.js'
import type { PmAgentConfig } from '../contextBuilding.js'

export interface InstructionToolsDeps {
  toolCalls: ToolCallRecord[]
  config: Pick<PmAgentConfig, 'repoRoot' | 'repoFullName' | 'projectId'>
}

/**
 * Create instruction loading tools.
 */
export function createInstructionTools(deps: InstructionToolsDeps) {
  const { toolCalls, config } = deps

  const getInstructionSetTool = tool({
    description:
      'Load instruction content from HAL/Supabase. Use `agentType` to load a full agent instruction set (plus additional topic index), or `topicId` to load one specific topic.',
    parameters: z
      .object({
        topicId: z
          .string()
          .nullable()
          .describe(
            'Specific instruction topic ID (e.g., "auditability-and-traceability", "qa-audit-report", "done-means-pushed"). Set to null when loading by agentType.'
          ),
        agentType: z
          .enum(['project-manager', 'implementation-agent', 'qa-agent', 'process-review-agent'])
          .nullable()
          .describe(
            'Agent type for full instruction-set loading (loads all basic instructions for that agent plus additional topics). Set to null when loading a specific topic by topicId.'
          ),
      })
      .refine((value) => Boolean((value.topicId ?? '').trim() || value.agentType), {
        message: 'Provide either topicId or agentType.',
      }),
    execute: async (input) => {
      try {
        const repoFullName = config.repoFullName || config.projectId || 'beardedphil/portfolio-2026-hal'
        const agentTypeLabels: Record<
          'project-manager' | 'implementation-agent' | 'qa-agent' | 'process-review-agent',
          string
        > = {
          'project-manager': 'Project Manager',
          'implementation-agent': 'Implementation Agent',
          'qa-agent': 'QA Agent',
          'process-review-agent': 'Process Review Agent',
        }

        const topicId = (input.topicId ?? '').trim()

        // First mode: full instruction set by agent type.
        if (input.agentType) {
          const targetAgentType = input.agentType
          type AgentInstruction = {
            topicId: string
            filename: string
            title: string
            description: string
            content: string
            agentTypes: string[]
            alwaysApply: boolean
          }

          const mapHalInstruction = (raw: Record<string, unknown>): AgentInstruction => {
            const rawTopicId = typeof raw.topicId === 'string' ? raw.topicId.trim() : ''
            const rawFilename = typeof raw.filename === 'string' ? raw.filename.trim() : ''
            const topicIdValue = rawTopicId || rawFilename.replace(/\.mdc$/i, '')
            const filenameValue = rawFilename || `${topicIdValue || 'unknown'}.mdc`
            const topicMeta = raw.topicMetadata as { title?: string; description?: string } | undefined
            const titleValue =
              (typeof raw.title === 'string' ? raw.title.trim() : '') ||
              topicMeta?.title ||
              filenameValue.replace(/\.mdc$/i, '').replace(/-/g, ' ')
            const descriptionValue =
              (typeof raw.description === 'string' ? raw.description.trim() : '') ||
              topicMeta?.description ||
              'No description'
            const contentValue =
              typeof raw.contentMd === 'string'
                ? raw.contentMd
                : typeof raw.contentBody === 'string'
                  ? raw.contentBody
                  : ''
            const agentTypesValue = Array.isArray(raw.agentTypes)
              ? raw.agentTypes.filter((v): v is string => typeof v === 'string')
              : []
            return {
              topicId: topicIdValue,
              filename: filenameValue,
              title: titleValue,
              description: descriptionValue,
              content: contentValue,
              agentTypes: agentTypesValue,
              alwaysApply: raw.alwaysApply === true,
            }
          }

          const dedupeTopics = (topics: Array<{ topicId: string; title: string; description: string }>) => {
            const seen = new Set<string>()
            const unique: Array<{ topicId: string; title: string; description: string }> = []
            for (const topic of topics) {
              if (!topic.topicId || seen.has(topic.topicId)) continue
              seen.add(topic.topicId)
              unique.push(topic)
            }
            return unique.sort((a, b) => a.topicId.localeCompare(b.topicId))
          }

          let basicInstructions: AgentInstruction[] = []
          let additionalTopicCandidates: AgentInstruction[] = []

          // Try HAL API first (preferred path)
          let halBaseUrl: string | null = (process.env.HAL_API_BASE_URL || 'https://portfolio-2026-hal.vercel.app').trim()
          try {
            const apiBaseUrlPath = path.join(config.repoRoot, '.hal', 'api-base-url')
            const apiBaseUrlContent = await fs.readFile(apiBaseUrlPath, 'utf8')
            const candidate = apiBaseUrlContent.trim()
            if (candidate) halBaseUrl = candidate
          } catch {
            // .hal/api-base-url missing
          }

          if (halBaseUrl) {
            try {
              const [basicRes, situationalRes] = await Promise.all([
                fetch(`${halBaseUrl}/api/instructions/get`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    repoFullName,
                    agentType: targetAgentType,
                    includeBasic: true,
                    includeSituational: false,
                  }),
                }),
                fetch(`${halBaseUrl}/api/instructions/get`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    repoFullName,
                    agentType: targetAgentType,
                    includeBasic: false,
                    includeSituational: true,
                  }),
                }),
              ])

              if (basicRes.ok) {
                const basicData = (await basicRes.json()) as {
                  success?: boolean
                  instructions?: Array<Record<string, unknown>>
                }
                if (basicData.success && Array.isArray(basicData.instructions)) {
                  basicInstructions = basicData.instructions.map(mapHalInstruction)
                }
              }

              if (situationalRes.ok) {
                const situationalData = (await situationalRes.json()) as {
                  success?: boolean
                  instructions?: Array<Record<string, unknown>>
                }
                if (situationalData.success && Array.isArray(situationalData.instructions)) {
                  additionalTopicCandidates = situationalData.instructions.map(mapHalInstruction)
                }
              }
            } catch (apiErr) {
              console.warn('[PM Agent] HAL API agent instruction-set fetch failed, falling back:', apiErr)
            }
          }

          if (basicInstructions.length === 0 && additionalTopicCandidates.length === 0) {
            const error = {
              error: `No instruction set found for agentType "${targetAgentType}". Ensure HAL/Supabase instruction data is available.`,
            }
            toolCalls.push({ name: 'get_instruction_set', input, output: error })
            return error
          }

          const additionalTopics = dedupeTopics(
            additionalTopicCandidates.map((inst) => ({
              topicId: inst.topicId,
              title: inst.title,
              description: inst.description,
            }))
          )

          const contentSections: string[] = []
          contentSections.push(`# Instruction set for ${agentTypeLabels[targetAgentType]}`)
          contentSections.push(
            `Loaded ${basicInstructions.length} basic instruction${basicInstructions.length === 1 ? '' : 's'} for \`${targetAgentType}\`.`
          )

          if (basicInstructions.length > 0) {
            contentSections.push('## Basic instructions (full set)')
            for (const inst of basicInstructions) {
              contentSections.push(`### ${inst.title} (\`${inst.topicId}\`)`)
              contentSections.push(inst.content)
            }
          }

          if (additionalTopics.length > 0) {
            contentSections.push('## Additional topics (request on-demand)')
            for (const topic of additionalTopics) {
              contentSections.push(`- **${topic.title}** (ID: \`${topic.topicId}\`): ${topic.description}`)
            }
            contentSections.push(
              'Request a topic with `get_instruction_set({ topicId: "<topic-id>" })` when a specific workflow is needed.'
            )
          }

          const result = {
            mode: 'agent-type',
            agentType: targetAgentType,
            title: `Instruction set for ${agentTypeLabels[targetAgentType]}`,
            basicInstructions: basicInstructions.map((inst) => ({
              topicId: inst.topicId,
              title: inst.title,
              description: inst.description,
              content: inst.content,
            })),
            additionalTopics,
            content: contentSections.join('\n\n'),
          }
          toolCalls.push({ name: 'get_instruction_set', input, output: result })
          return result
        }

        // Second mode: fetch one topic by topicId.
        if (!topicId) {
          const error = { error: 'Either topicId or agentType is required.' }
          toolCalls.push({ name: 'get_instruction_set', input, output: error })
          return error
        }

        // Try HAL API first (preferred method)
        let halBaseUrl: string | null = null
        try {
          const apiBaseUrlPath = path.join(config.repoRoot, '.hal', 'api-base-url')
          const apiBaseUrlContent = await fs.readFile(apiBaseUrlPath, 'utf8')
          halBaseUrl = apiBaseUrlContent.trim()
        } catch {
          // .hal/api-base-url not found
        }

        if (halBaseUrl) {
          try {
            const res = await fetch(`${halBaseUrl}/api/instructions/get-topic`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                topicId,
                repoFullName,
              }),
            })

            if (res.ok) {
              const data = await res.json()
              if (data.success) {
                const result = {
                  topicId: data.topicId,
                  title: data.title,
                  description: data.description,
                  content: data.content || data.contentMd || '',
                }
                toolCalls.push({ name: 'get_instruction_set', input, output: result })
                return result
              } else {
                return { error: data.error || 'Failed to load instruction topic' }
              }
            }
          } catch (apiErr) {
            console.warn('[PM Agent] HAL API instruction topic fetch failed, falling back:', apiErr)
          }
        }

        return {
          error: `Cannot load instruction topic "${topicId}" from filesystem. Individual instruction files have been migrated to Supabase. Use HAL API endpoint \`/api/instructions/get-topic\` or direct Supabase access to retrieve instructions. If Supabase/HAL API is not available, instructions cannot be loaded.`,
        }
      } catch (err) {
        const error = {
          error: `Error loading instruction set: ${err instanceof Error ? err.message : String(err)}`,
        }
        toolCalls.push({ name: 'get_instruction_set', input, output: error })
        return error
      }
    },
  })

  return {
    get_instruction_set: getInstructionSetTool,
  }
}
