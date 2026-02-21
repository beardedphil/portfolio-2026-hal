/**
 * Helper functions extracted from projectManager.ts to improve maintainability and testability.
 * These utilities handle placeholder detection, error handling, and other common operations.
 */

import { PLACEHOLDER_RE } from '../../lib/projectManagerHelpers.js'

/**
 * Detects placeholders in ticket body and returns validation result.
 * Used by createTicketTool and updateTicketBodyTool to prevent placeholder injection.
 */
export function validateNoPlaceholders(bodyMd: string): {
  hasPlaceholders: boolean
  uniquePlaceholders: string[]
  errorMessage?: string
} {
  const trimmed = bodyMd.trim()
  const placeholders = trimmed.match(PLACEHOLDER_RE) ?? []
  
  if (placeholders.length === 0) {
    return {
      hasPlaceholders: false,
      uniquePlaceholders: [],
    }
  }

  const uniquePlaceholders = [...new Set(placeholders)]
  return {
    hasPlaceholders: true,
    uniquePlaceholders,
    errorMessage: `unresolved template placeholder tokens detected. Detected placeholders: ${uniquePlaceholders.join(', ')}.`,
  }
}

/**
 * Checks if an error is an abort error.
 * Used to determine if an error should be re-thrown (abort) vs handled gracefully.
 */
export function isAbortError(err: unknown, abortSignal?: { aborted: boolean }): boolean {
  return (
    abortSignal?.aborted === true ||
    (typeof (err as any)?.name === 'string' && String((err as any).name).toLowerCase() === 'aborterror') ||
    (err instanceof Error && /aborted|abort/i.test(err.message))
  )
}

/**
 * Checks if GitHub repo is available for tool usage.
 * Determines whether to use GitHub API or fall back to HAL repo filesystem access.
 */
export function hasGitHubRepo(
  repoFullName?: string,
  githubReadFile?: (path: string, maxLines?: number) => Promise<{ content: string } | { error: string }>
): boolean {
  return (
    typeof repoFullName === 'string' &&
    repoFullName.trim() !== '' &&
    typeof githubReadFile === 'function'
  )
}

/**
 * Truncates long input for logging purposes.
 * Used to prevent logging huge ticket bodies in tool call records.
 */
export function truncateForLogging(input: string, maxLength: number = 500): string {
  return input.slice(0, maxLength) + (input.length > maxLength ? '...' : '')
}

/**
 * Creates RED artifact body markdown from RED document data.
 * Used to create mirrored RED artifacts for visibility in ticket Artifacts section.
 */
export function createRedArtifactBody(
  version: number,
  redId: string,
  createdAt: string,
  validationStatus: string,
  redJson: unknown
): string {
  return `# RED Document Version ${version}

RED ID: ${String(redId)}
Created: ${createdAt}
Validation Status: ${validationStatus}

## Canonical RED JSON

\`\`\`json
${JSON.stringify(redJson, null, 2)}
\`\`\`
`
}

/**
 * Creates RED artifact title from version and creation date.
 */
export function createRedArtifactTitle(version: number, createdAt: string): string {
  return `RED v${version} — ${createdAt.split('T')[0]}`
}
