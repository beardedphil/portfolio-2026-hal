import type { Session } from '../../_lib/github/session.js'
import { fetchFileContents, searchCode, listDirectoryContents } from '../../_lib/github/githubApi.js'

export type GitHubFunctions = {
  githubReadFile?: (filePath: string, maxLines?: number) => Promise<string>
  githubSearchCode?: (pattern: string, glob?: string) => Promise<unknown[]>
  githubListDirectory?: (dirPath: string) => Promise<unknown[]>
}

/**
 * Creates GitHub API functions if both token and repoFullName are available.
 * Returns undefined for each function if prerequisites are not met.
 */
export function createGitHubFunctions(
  session: Session,
  repoFullName?: string
): GitHubFunctions {
  const githubToken = session.github?.accessToken

  // Debug logging (0119: fix PM agent repo selection)
  const hasCookie = !!session
  if (repoFullName && !githubToken) {
    console.warn(
      `[PM] ⚠️ repoFullName provided (${repoFullName}) but no GitHub token in session.`
    )
  }
  if (githubToken && !repoFullName) {
    console.warn(`[PM] GitHub token available but no repoFullName provided`)
  }

  const githubReadFile =
    githubToken && repoFullName
      ? (filePath: string, maxLines = 500) => {
          console.log(`[PM] Using GitHub API to read file: ${repoFullName}/${filePath}`)
          return fetchFileContents(githubToken, repoFullName, filePath, maxLines)
        }
      : undefined

  const githubSearchCode =
    githubToken && repoFullName
      ? (pattern: string, glob?: string) => {
          console.log(`[PM] Using GitHub API to search: ${repoFullName} pattern: ${pattern}`)
          return searchCode(githubToken, repoFullName, pattern, glob)
        }
      : undefined

  const githubListDirectory =
    githubToken && repoFullName
      ? (dirPath: string) => {
          console.log(`[PM] Using GitHub API to list directory: ${repoFullName}/${dirPath}`)
          return listDirectoryContents(githubToken, repoFullName, dirPath)
        }
      : undefined

  if (!githubReadFile && repoFullName) {
    console.warn(
      `[PM] githubReadFile is undefined even though repoFullName=${repoFullName} - token missing?`
    )
  }

  return {
    githubReadFile,
    githubSearchCode,
    githubListDirectory,
  }
}
