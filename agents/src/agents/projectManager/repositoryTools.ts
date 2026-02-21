/**
 * Repository access tools extracted from projectManager.ts to improve maintainability.
 */

import { tool } from 'ai'
import { z } from 'zod'
import type { ToolCallRecord } from '../projectManager.js'
import type { PmAgentConfig } from './contextBuilding.js'
import type { ToolContext } from '../tools.js'
import { readFile, searchFiles, listDirectory } from '../tools.js'

export function createRepositoryTools(
  toolCalls: ToolCallRecord[],
  config: PmAgentConfig,
  ctx: ToolContext,
  hasGitHubRepo: boolean,
  repoUsage: Array<{ tool: string; usedGitHub: boolean; path?: string }>
) {
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
        // Debug: log when using GitHub API (0119)
        if (typeof console !== 'undefined' && console.log) {
          console.log(`[PM Agent] Using GitHub API to read: ${config.repoFullName}/${input.path}`)
        }
        out = await config.githubReadFile(input.path, 500)
      } else {
        // Debug: log when falling back to HAL repo (0119)
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
        // Debug: log when using GitHub API (0119)
        if (typeof console !== 'undefined' && console.log) {
          console.log(`[PM Agent] Using GitHub API to search: ${config.repoFullName} pattern: ${input.pattern}`)
        }
        out = await config.githubSearchCode(input.pattern, input.glob)
      } else {
        // Debug: log when falling back to HAL repo (0119)
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
        // Debug: log when using GitHub API (0119)
        if (typeof console !== 'undefined' && console.log) {
          console.log(`[PM Agent] Using GitHub API to list directory: ${config.repoFullName}/${input.path}`)
        }
        out = await config.githubListDirectory(input.path)
      } else {
        // Debug: log when falling back to HAL repo (0119)
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

  return {
    read_file: readFileTool,
    search_files: searchFilesTool,
    list_directory: listDirectoryTool,
  }
}
