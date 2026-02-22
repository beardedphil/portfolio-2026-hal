/**
 * File operation tools for PM agent.
 * Extracted from projectManager.ts to reduce complexity.
 */

import { tool } from 'ai'
import { z } from 'zod'
import {
  readFile,
  searchFiles,
  listDirectory,
  type ToolContext,
} from '../tools.js'
import type { ToolCallRecord } from '../projectManager.js'
import type { PmAgentConfig } from './contextBuilding.js'

export function createReadFileTool(
  config: PmAgentConfig,
  toolCalls: ToolCallRecord[],
  ctx: ToolContext,
  hasGitHubRepo: boolean,
  repoUsage: Array<{ tool: string; usedGitHub: boolean; path?: string }>
) {
  return tool({
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
}

export function createSearchFilesTool(
  config: PmAgentConfig,
  toolCalls: ToolCallRecord[],
  ctx: ToolContext,
  hasGitHubRepo: boolean,
  repoUsage: Array<{ tool: string; usedGitHub: boolean; path?: string }>
) {
  return tool({
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
}

export function createListDirectoryTool(
  config: PmAgentConfig,
  toolCalls: ToolCallRecord[],
  ctx: ToolContext,
  hasGitHubRepo: boolean,
  repoUsage: Array<{ tool: string; usedGitHub: boolean; path?: string }>
) {
  return tool({
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
}
