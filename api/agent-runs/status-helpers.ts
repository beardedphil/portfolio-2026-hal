/**
 * Helper functions for status.ts
 */

export function capText(input: string, maxChars: number): string {
  if (input.length <= maxChars) return input
  return `${input.slice(0, maxChars)}\n\n[truncated]`
}

export function isPlaceholderSummary(summary: string | null | undefined): boolean {
  const s = String(summary ?? '').trim()
  if (!s) return true
  return s === 'Completed.' || s === 'Done.' || s === 'Complete.' || s === 'Finished.'
}

export type AgentType = 'implementation' | 'qa' | 'project-manager' | 'process-review'

export const MAX_RUN_SUMMARY_CHARS = 20_000
