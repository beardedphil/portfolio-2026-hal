/**
 * Utility functions for working with conversation IDs.
 * 
 * Conversation IDs follow the format: `{agentRole}-{instanceNumber}`
 * Example: `project-manager-1`, `implementation-agent-2`
 */

import type { Agent, Conversation } from '../types/hal'

/**
 * Generate a conversation ID from an agent role and instance number.
 * 
 * @param agentRole - The agent role (e.g., 'project-manager', 'implementation-agent')
 * @param instanceNumber - The instance number (1-based)
 * @returns The conversation ID in the format `{agentRole}-{instanceNumber}`
 * 
 * @example
 * getConversationId('project-manager', 1) // returns 'project-manager-1'
 * getConversationId('implementation-agent', 2) // returns 'implementation-agent-2'
 */
export function getConversationId(agentRole: Agent, instanceNumber: number): string {
  return `${agentRole}-${instanceNumber}`
}

/**
 * Parse a conversation ID to extract the agent role and instance number.
 * 
 * @param conversationId - The conversation ID to parse
 * @returns An object with `agentRole` and `instanceNumber`, or `null` if the ID is invalid
 * 
 * @example
 * parseConversationId('project-manager-1') // returns { agentRole: 'project-manager', instanceNumber: 1 }
 * parseConversationId('invalid-id') // returns null
 */
export function parseConversationId(conversationId: string): { agentRole: Agent; instanceNumber: number } | null {
  const match = conversationId.match(/^(project-manager|implementation-agent|qa-agent|process-review-agent)-(\d+)$/)
  if (!match) return null
  return {
    agentRole: match[1] as Agent,
    instanceNumber: parseInt(match[2], 10),
  }
}

/**
 * Get the next available instance number for an agent role.
 * 
 * Scans all conversations in the map and finds the highest instance number
 * for the given agent role, then returns the next number (max + 1).
 * 
 * @param conversations - Map of conversation IDs to Conversation objects
 * @param agentRole - The agent role to find the next instance number for
 * @returns The next available instance number (1 if no conversations exist for this agent role)
 * 
 * @example
 * const conversations = new Map([
 *   ['project-manager-1', { agentRole: 'project-manager', instanceNumber: 1, ... }],
 *   ['project-manager-3', { agentRole: 'project-manager', instanceNumber: 3, ... }],
 * ])
 * getNextInstanceNumber(conversations, 'project-manager') // returns 4
 * getNextInstanceNumber(conversations, 'qa-agent') // returns 1 (no qa-agent conversations exist)
 */
export function getNextInstanceNumber(conversations: Map<string, Conversation>, agentRole: Agent): number {
  let maxNumber = 0
  for (const conv of conversations.values()) {
    if (conv.agentRole === agentRole && conv.instanceNumber > maxNumber) {
      maxNumber = conv.instanceNumber
    }
  }
  return maxNumber + 1
}
