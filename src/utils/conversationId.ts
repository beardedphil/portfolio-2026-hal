/**
 * Conversation ID parsing and formatting helpers.
 * 
 * Conversation IDs follow the format: "{agentRole}-{instanceNumber}"
 * Example: "project-manager-1", "implementation-agent-2"
 */
import type { Agent } from '../types/hal'

/**
 * Generate conversation ID for an agent role and instance number.
 * 
 * @param agentRole - The agent role (e.g., 'project-manager', 'implementation-agent')
 * @param instanceNumber - The instance number (1, 2, 3, etc.)
 * @returns The conversation ID string (e.g., "project-manager-1")
 */
export function getConversationId(agentRole: Agent, instanceNumber: number): string {
  return `${agentRole}-${instanceNumber}`
}

/**
 * Parse conversation ID to extract agent role and instance number.
 * 
 * @param conversationId - The conversation ID string to parse
 * @returns An object with agentRole and instanceNumber, or null if parsing fails
 */
export function parseConversationId(conversationId: string): { agentRole: Agent; instanceNumber: number } | null {
  const match = conversationId.match(/^(project-manager|implementation-agent|qa-agent|process-review-agent)-(\d+)$/)
  if (!match) return null
  return {
    agentRole: match[1] as Agent,
    instanceNumber: parseInt(match[2], 10),
  }
}
