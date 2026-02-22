/**
 * Repository usage tracking for PM agent tools.
 * Tracks which repository (GitHub vs HAL) is used for each tool call.
 */

export interface RepoUsageRecord {
  tool: string
  usedGitHub: boolean
  path?: string
}

/**
 * Determines if GitHub repo is available based on config.
 */
export function hasGitHubRepo(config: {
  repoFullName?: string
  githubReadFile?: (path: string, maxLines?: number) => Promise<{ content: string } | { error: string }>
}): boolean {
  return (
    typeof config.repoFullName === 'string' &&
    config.repoFullName.trim() !== '' &&
    typeof config.githubReadFile === 'function'
  )
}

/**
 * Creates a repo usage tracker that records which repo is used for each tool call.
 */
export function createRepoUsageTracker(): {
  records: RepoUsageRecord[]
  track: (tool: string, usedGitHub: boolean, path?: string) => void
} {
  const records: RepoUsageRecord[] = []
  return {
    records,
    track: (tool: string, usedGitHub: boolean, path?: string) => {
      records.push({ tool, usedGitHub, path })
    },
  }
}
