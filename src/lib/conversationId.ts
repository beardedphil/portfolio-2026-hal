/**
 * Conversation ID parsing and formatting utilities
 * 
 * Handles conversion between conversation IDs (e.g., "project-manager-1") 
 * and their component parts (agent role and instance number).
 */

import type { Agent } from './conversationStorage'

/**
 * Generate conversation ID for an agent role and instance number.
 * 
 * @param agentRole - The agent role (e.g., 'project-manager', 'implementation-agent')
 * @param instanceNumber - The instance number (1, 2, 3, etc.)
 * @returns Conversation ID in format "{agentRole}-{instanceNumber}"
 * 
 * @example
 * getConversationId('project-manager', 1) // Returns "project-manager-1"
 * getConversationId('implementation-agent', 2) // Returns "implementation-agent-2"
 */
export function getConversationId(agentRole: Agent, instanceNumber: number): string {
  return `${agentRole}-${instanceNumber}`
}

/**
 * Parse conversation ID to get agent role and instance number.
 * 
 * @param conversationId - The conversation ID to parse (e.g., "project-manager-1")
 * @returns Object with agentRole and instanceNumber, or null if the ID format is invalid
 * 
 * @example
 * parseConversationId('project-manager-1') // Returns { agentRole: 'project-manager', instanceNumber: 1 }
 * parseConversationId('invalid-id') // Returns null
 */
export function parseConversationId(conversationId: string): { agentRole: Agent; instanceNumber: number } | null {
  const match = conversationId.match(/^(project-manager|implementation-agent|qa-agent|process-review-agent)-(\d+)$/)
  if (!match) return null
  return {
    agentRole: match[1] as Agent,
    instanceNumber: parseInt(match[2], 10),
  }
}
