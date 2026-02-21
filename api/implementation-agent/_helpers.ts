/**
 * Helper functions for implementation agent run handler.
 * Extracted for testability and improved maintainability.
 */

/**
 * Parses ticket ID from a message string.
 * Expects format: "Implement ticket XXXX" (case-insensitive).
 * @param message - The message to parse
 * @returns The ticket ID (exactly 4 digits) or null if not found
 */
export function parseTicketId(message: string): string | null {
  const trimmed = message.trim()
  // Match exactly 4 digits (not 5+ digits)
  const match = trimmed.match(/implement\s+ticket\s+(\d{4})(?!\d)/i)
  return match ? match[1] : null
}

/**
 * Parses ticket body sections (Goal, Human-verifiable deliverable, Acceptance criteria).
 * @param bodyMd - The ticket body markdown
 * @returns Object with parsed sections (empty strings if not found)
 */
export function parseTicketBodySections(bodyMd: string): {
  goal: string
  deliverable: string
  criteria: string
} {
  const goalMatch = bodyMd.match(/##\s*Goal\s*\([^)]*\)\s*\n([\s\S]*?)(?=\n##|$)/i)
  const deliverableMatch = bodyMd.match(/##\s*Human-verifiable deliverable[^\n]*\n([\s\S]*?)(?=\n##|$)/i)
  const criteriaMatch = bodyMd.match(/##\s*Acceptance criteria[^\n]*\n([\s\S]*?)(?=\n##|$)/i)
  
  return {
    goal: (goalMatch?.[1] ?? '').trim(),
    deliverable: (deliverableMatch?.[1] ?? '').trim(),
    criteria: (criteriaMatch?.[1] ?? '').trim(),
  }
}

/**
 * Builds the failure notes section for the prompt.
 * @param implementationAgentNote - Optional note from QA about previous failure
 * @param isBackInTodo - Whether the ticket is back in To Do column
 * @returns Array of strings to include in the prompt
 */
export function buildFailureNotesSection(
  implementationAgentNote: string | null,
  isBackInTodo: boolean
): string[] {
  if (implementationAgentNote) {
    return [
      '## IMPORTANT: Previous QA Failure — Implementation Agent Note',
      '',
      '**This ticket previously failed QA. The following note from QA explains what went wrong and what you must fix:**',
      '',
      '```',
      implementationAgentNote,
      '```',
      '',
      '**You MUST address every issue and required action above. Do NOT simply re-implement the same solution.**',
      '',
    ]
  }
  
  return [
    '## IMPORTANT: Read Failure Notes Before Starting',
    '',
    '**BEFORE you start implementing, you MUST:**',
    '',
    '1. **Read the full ticket body above** - Look for any failure notes, QA feedback, or comments that explain why this ticket was previously failed or moved back to To Do.',
    '',
    '2. **Check for QA artifacts** - Call the HAL API to fetch all artifacts for this ticket. Look for QA reports (agent_type: "qa") that may contain failure reasons or feedback.',
    '',
    '3. **Address any failure reasons** - If the ticket was previously failed, you MUST read and address the specific issues mentioned in QA reports or ticket notes. Do NOT simply re-implement the same solution.',
    '',
    isBackInTodo ? '**⚠️ This ticket is back in To Do - it may have been moved back after a failure. Check for QA reports and failure notes before starting.**' : '',
    '',
  ]
}

/**
 * Gets the HAL API URL from environment variables or defaults to localhost.
 * @returns The HAL API base URL
 */
export function getHalApiUrl(): string {
  return process.env.HAL_API_URL || process.env.APP_ORIGIN || 'http://localhost:5173'
}
