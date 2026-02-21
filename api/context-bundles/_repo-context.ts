/**
 * Deterministic repo_context generation for Context Bundles.
 * Generates a stable set of file pointers and tiny snippets from PR/commit changes.
 */

import { fetchPullRequestFiles } from '../_lib/github/pullRequests.js'
import { fetchFileContents } from '../_lib/github/files.js'
import { githubFetch } from '../_lib/github/client.js'

export interface RepoContextEntry {
  path: string
  line_range?: [number, number] // [start_line, end_line] (1-indexed)
  excerpt: string // Max 300 characters
}

export interface RepoContext {
  repo_full_name: string
  ordering_note: string
  entries: RepoContextEntry[]
}

/**
 * Generates deterministic repo_context from PR or commit.
 * 
 * Rules:
 * - Max 5 files total
 * - Max 300 characters per snippet (excluding path + line-range metadata)
 * - Deterministic ordering: recent_deltas → distilled references → pinned/core; then lexicographic path
 * - Each entry includes: file path, line range (when available), and short excerpt
 * 
 * @param token - GitHub access token (optional, required for fetching file contents)
 * @param repoFullName - Repository full name (e.g., "owner/repo")
 * @param gitRef - Git reference with PR URL or commit SHA
 * @returns RepoContext with deterministic file entries
 */
export async function generateRepoContext(
  token: string | null,
  repoFullName: string,
  gitRef: {
    pr_url?: string
    pr_number?: number
    base_sha?: string
    head_sha?: string
  } | null
): Promise<RepoContext> {
  const result: RepoContext = {
    repo_full_name: repoFullName,
    ordering_note: 'Ordered by: recent_deltas → distilled references → pinned/core; then lexicographic path',
    entries: [],
  }

  // If no gitRef or no way to fetch files, return minimal context
  if (!gitRef || (!gitRef.pr_url && !gitRef.head_sha)) {
    return result
  }

  // If no token, we can't fetch file contents, so return minimal context
  if (!token) {
    return result
  }

  try {
    let files: Array<{ filename: string; additions?: number; deletions?: number; patch?: string | null }> = []

    // Fetch files from PR or commit
    if (gitRef.pr_url) {
      // Fetch PR files
      const prFilesResult = await fetchPullRequestFiles(token, gitRef.pr_url)
      if ('error' in prFilesResult) {
        // If PR fetch fails, return minimal context
        return result
      }
      files = prFilesResult.files.map((f) => ({
        filename: f.filename,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch,
      }))
    } else if (gitRef.head_sha) {
      // Fetch commit files
      const [owner, repo] = repoFullName.split('/')
      if (!owner || !repo) {
        return result
      }

      try {
        const commitData = await githubFetch<{
          files?: Array<{
            filename?: string
            additions?: number
            deletions?: number
            patch?: string | null
          }>
        }>(token, `https://api.github.com/repos/${owner}/${repo}/commits/${gitRef.head_sha}`)

        files = (commitData.files || []).map((f) => ({
          filename: f.filename || '',
          additions: f.additions,
          deletions: f.deletions,
          patch: f.patch,
        }))
      } catch {
        // If commit fetch fails, return minimal context
        return result
      }
    }

    if (files.length === 0) {
      return result
    }

    // Sort files deterministically:
    // 1. By change size (additions + deletions) descending (recent_deltas)
    // 2. Then by filename lexicographically
    const sortedFiles = [...files].sort((a, b) => {
      const aSize = (a.additions || 0) + (a.deletions || 0)
      const bSize = (b.additions || 0) + (b.deletions || 0)
      if (bSize !== aSize) {
        return bSize - aSize // Descending by size
      }
      return a.filename.localeCompare(b.filename) // Lexicographic
    })

    // Take top 5 files
    const selectedFiles = sortedFiles.slice(0, 5)

    // Generate entries for each selected file
    for (const file of selectedFiles) {
      const entry: RepoContextEntry = {
        path: file.filename,
        excerpt: '',
      }

      // Try to extract line range and excerpt from patch
      if (file.patch) {
        // Extract line numbers from patch (e.g., "@@ -10,5 +10,6 @@" means lines 10-15 in new file)
        const lineRangeMatch = file.patch.match(/@@\s*-\d+(?:,\d+)?\s*\+(\d+)(?:,(\d+))?/g)
        if (lineRangeMatch && lineRangeMatch.length > 0) {
          // Use first hunk's line range
          const firstHunk = lineRangeMatch[0]
          const hunkMatch = firstHunk.match(/\+(\d+)(?:,(\d+))?/)
          if (hunkMatch) {
            const startLine = parseInt(hunkMatch[1], 10)
            const lineCount = hunkMatch[2] ? parseInt(hunkMatch[2], 10) : 1
            entry.line_range = [startLine, startLine + lineCount - 1]
          }
        }

        // Extract excerpt from patch (prioritize added lines, max 300 chars)
        // Focus on actual code changes, with minimal context
        const patchLines = file.patch.split('\n')
        const addedLines: string[] = []
        const contextLines: string[] = []
        
        for (const line of patchLines) {
          if (line.startsWith('+') && !line.startsWith('+++')) {
            // Added line (skip the + prefix)
            addedLines.push(line.slice(1))
          } else if (line.startsWith(' ') && !line.startsWith('@@')) {
            // Context line (keep limited context)
            if (contextLines.length < 3) {
              contextLines.push(line.slice(1))
            }
          }
          
          // Build excerpt: prefer added lines, with minimal context
          const excerptParts: string[] = []
          // Add up to 2 context lines before first addition if available
          if (addedLines.length > 0 && contextLines.length > 0) {
            excerptParts.push(...contextLines.slice(0, 2))
          }
          excerptParts.push(...addedLines)
          
          const currentExcerpt = excerptParts.join('\n')
          if (currentExcerpt.length >= 300) {
            break
          }
        }
        
        // Final excerpt: added lines with minimal context
        const finalParts: string[] = []
        if (addedLines.length > 0) {
          // Include up to 2 context lines before additions
          if (contextLines.length > 0) {
            finalParts.push(...contextLines.slice(0, 2))
          }
          finalParts.push(...addedLines)
        } else if (contextLines.length > 0) {
          // Fallback: use context lines if no additions
          finalParts.push(...contextLines)
        }
        
        entry.excerpt = truncateToMaxChars(finalParts.join('\n'), 300)
      } else {
        // No patch available (binary file or too large), try to fetch file contents
        try {
          const fileContentsResult = await fetchFileContents(
            token,
            repoFullName,
            file.filename,
            50, // Max 50 lines
            gitRef.head_sha || undefined
          )
          if ('content' in fileContentsResult) {
            entry.excerpt = truncateToMaxChars(fileContentsResult.content, 300)
            // Set line range to first 50 lines if we fetched that many
            const lines = fileContentsResult.content.split('\n')
            if (lines.length > 0) {
              entry.line_range = [1, Math.min(50, lines.length)]
            }
          } else {
            entry.excerpt = `[File: ${file.filename}]`
          }
        } catch {
          entry.excerpt = `[File: ${file.filename}]`
        }
      }

      result.entries.push(entry)
    }
  } catch (err) {
    // On any error, return minimal context
    console.error('Error generating repo_context:', err)
    return result
  }

  return result
}

/**
 * Truncates a string to maxChars, ensuring we don't break in the middle of a word if possible.
 */
function truncateToMaxChars(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text
  }

  // Try to truncate at a word boundary
  const truncated = text.slice(0, maxChars)
  const lastSpace = truncated.lastIndexOf(' ')
  const lastNewline = truncated.lastIndexOf('\n')

  // Prefer newline boundary, then space boundary
  if (lastNewline > maxChars * 0.8) {
    return truncated.slice(0, lastNewline) + '...'
  }
  if (lastSpace > maxChars * 0.8) {
    return truncated.slice(0, lastSpace) + '...'
  }

  // Otherwise, just truncate
  return truncated + '...'
}
