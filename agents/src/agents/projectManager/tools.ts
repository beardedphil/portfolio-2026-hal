/**
 * Tool definitions for Project Manager agent.
 * Extracted from projectManager.ts to improve maintainability.
 */

import { tool, jsonSchema } from 'ai'
import { z } from 'zod'
import {
  normalizeBodyForReady,
  normalizeTitleLineInBody,
} from '../../lib/ticketBodyNormalization.js'
import {
  slugFromTitle,
  parseTicketNumber,
  evaluateTicketReady,
  PLACEHOLDER_RE,
} from '../../lib/projectManagerHelpers.js'
import {
  listDirectory,
  readFile,
  searchFiles,
  type ToolContext,
} from '../tools.js'
import { COL_UNASSIGNED, COL_TODO } from '../projectManager.js'
import type { ToolCallRecord } from '../projectManager.js'

export interface ToolCreationContext {
  toolCalls: ToolCallRecord[]
  config: {
    repoRoot: string
    projectId?: string
    repoFullName?: string
    githubReadFile?: (path: string, maxLines?: number) => Promise<{ content: string } | { error: string }>
    githubSearchCode?: (pattern: string, glob: string) => Promise<{ matches: Array<{ path: string; line: number; text: string }> } | { error: string }>
    githubListDirectory?: (path: string) => Promise<{ entries: string[] } | { error: string }>
    abortSignal?: AbortSignal
    onProgress?: (message: string) => void | Promise<void>
  }
  ctx: ToolContext
  halFetchJson: (
    path: string,
    body: unknown,
    opts?: { timeoutMs?: number; progressMessage?: string }
  ) => Promise<{ ok: boolean; json: any }>
  isAbortError: (err: unknown) => boolean
}

/**
 * Creates all tools for the PM agent.
 */
export function createPmTools(context: ToolCreationContext) {
  const { toolCalls, config, ctx, halFetchJson, isAbortError } = context

  const hasGitHubRepo =
    typeof config.repoFullName === 'string' &&
    config.repoFullName.trim() !== '' &&
    typeof config.githubReadFile === 'function'

  const repoUsage: Array<{ tool: string; usedGitHub: boolean; path?: string }> = []

  // Debug logging
  if (typeof console !== 'undefined' && console.warn) {
    console.warn(`[PM Agent] hasGitHubRepo=${hasGitHubRepo}, repoFullName=${config.repoFullName || 'NOT SET'}, hasGithubReadFile=${typeof config.githubReadFile === 'function'}, hasGithubSearchCode=${typeof config.githubSearchCode === 'function'}`)
  }

  const readFileTool = tool({
    description: hasGitHubRepo
      ? 'Read file contents from the connected GitHub repo. Path is relative to repo root. Max 500 lines. Uses committed code on default branch.'
      : 'Read file contents from HAL repo. Path is relative to repo root. Max 500 lines.',
    parameters: z.object({
      path: z.string().describe('File path (relative to repo/project root)'),
    }),
    execute: async (input) => {
      let out: { content: string } | { error: string }
      const usedGitHub = !!(hasGitHubRepo && config.githubReadFile)
      repoUsage.push({ tool: 'read_file', usedGitHub, path: input.path })
      if (hasGitHubRepo && config.githubReadFile) {
        if (typeof console !== 'undefined' && console.log) {
          console.log(`[PM Agent] Using GitHub API to read: ${config.repoFullName}/${input.path}`)
        }
        out = await config.githubReadFile(input.path, 500)
      } else {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn(`[PM Agent] Falling back to HAL repo for: ${input.path} (hasGitHubRepo=${hasGitHubRepo}, hasGithubReadFile=${typeof config.githubReadFile === 'function'})`)
        }
        out = await readFile(ctx, input)
      }
      toolCalls.push({ name: 'read_file', input, output: out })
      return typeof (out as { error?: string }).error === 'string'
        ? JSON.stringify(out)
        : out
    },
  })

  const searchFilesTool = tool({
    description: hasGitHubRepo
      ? 'Search code in the connected GitHub repo. Pattern is used as search term (GitHub does not support full regex).'
      : 'Regex search across files in HAL repo. Pattern is JavaScript regex.',
    parameters: z.object({
      pattern: z.string().describe('Regex pattern to search for'),
      glob: z.string().describe('Glob pattern to filter files (e.g. "**/*" for all, "**/*.ts" for TypeScript)'),
    }),
    execute: async (input) => {
      let out: { matches: Array<{ path: string; line: number; text: string }> } | { error: string }
      const usedGitHub = !!(hasGitHubRepo && config.githubSearchCode)
      repoUsage.push({ tool: 'search_files', usedGitHub, path: input.pattern })
      if (hasGitHubRepo && config.githubSearchCode) {
        if (typeof console !== 'undefined' && console.log) {
          console.log(`[PM Agent] Using GitHub API to search: ${config.repoFullName} pattern: ${input.pattern}`)
        }
        out = await config.githubSearchCode(input.pattern, input.glob)
      } else {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn(`[PM Agent] Falling back to HAL repo for search: ${input.pattern} (hasGitHubRepo=${hasGitHubRepo}, hasGithubSearchCode=${typeof config.githubSearchCode === 'function'})`)
        }
        out = await searchFiles(ctx, { pattern: input.pattern, glob: input.glob })
      }
      toolCalls.push({ name: 'search_files', input, output: out })
      return typeof (out as { error?: string }).error === 'string'
        ? JSON.stringify(out)
        : out
    },
  })

  const listDirectoryTool = tool({
    description: hasGitHubRepo
      ? 'List files in a directory in the connected GitHub repo. Path is relative to repo root.'
      : 'List files in a directory in HAL repo. Path is relative to repo root.',
    parameters: z.object({
      path: z.string().describe('Directory path (relative to repo/project root)'),
    }),
    execute: async (input) => {
      let out: { entries: string[] } | { error: string }
      const usedGitHub = !!(hasGitHubRepo && config.githubListDirectory)
      repoUsage.push({ tool: 'list_directory', usedGitHub, path: input.path })
      if (hasGitHubRepo && config.githubListDirectory) {
        if (typeof console !== 'undefined' && console.log) {
          console.log(`[PM Agent] Using GitHub API to list directory: ${config.repoFullName}/${input.path}`)
        }
        out = await config.githubListDirectory(input.path)
      } else {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn(`[PM Agent] Falling back to HAL repo for list_directory: ${input.path} (hasGitHubRepo=${hasGitHubRepo}, hasGithubListDirectory=${typeof config.githubListDirectory === 'function'})`)
        }
        out = await listDirectory(ctx, input)
      }
      toolCalls.push({ name: 'list_directory', input, output: out })
      return typeof (out as { error?: string }).error === 'string'
        ? JSON.stringify(out)
        : out
    },
  })

  const evaluateTicketReadyTool = tool({
    description:
      'Evaluate ticket body against the Ready-to-start checklist (Definition of Ready). Pass body_md from fetch_ticket_content. Returns ready (boolean), missingItems (list), and checklistResults. Always call this before kanban_move_ticket_to_todo; do not move if not ready.',
    parameters: z.object({
      body_md: z.string().describe('Full markdown body of the ticket (e.g. from fetch_ticket_content).'),
    }),
    execute: async (input: { body_md: string }) => {
      const out = evaluateTicketReady(input.body_md)
      toolCalls.push({ name: 'evaluate_ticket_ready', input: { body_md: input.body_md.slice(0, 500) + (input.body_md.length > 500 ? '...' : '') }, output: out })
      return out
    },
  })

  return {
    tools: {
      list_directory: listDirectoryTool,
      read_file: readFileTool,
      search_files: searchFilesTool,
      evaluate_ticket_ready: evaluateTicketReadyTool,
    },
    repoUsage,
  }
}
