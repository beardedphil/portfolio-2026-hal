/**
 * Conversation ID helper functions.
 * 
 * Pure utility functions for generating and parsing conversation IDs.
 * No React, DOM, or localStorage dependencies.
 */

import type { Agent, Conversation } from '../types/hal'

/**
 * Generate conversation ID for an agent role and instance number.
 * 
 * @param agentRole - The agent role (e.g., 'project-manager', 'implementation-agent')
 * @param instanceNumber - The instance number (e.g., 1, 2, 3)
 * @returns Conversation ID in format: `${agentRole}-${instanceNumber}`
 * 
 * @example
 * getConversationId('project-manager', 1) // returns 'project-manager-1'
 */
export function getConversationId(agentRole: Agent, instanceNumber: number): string {
  return `${agentRole}-${instanceNumber}`
}

/**
 * Parse conversation ID to get agent role and instance number.
 * 
 * @param conversationId - The conversation ID to parse
 * @returns Object with agentRole and instanceNumber, or null if invalid
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
 * Get next instance number for an agent role.
 * 
 * Scans all conversations and finds the highest instance number for the given agent role,
 * then returns the next number (max + 1). Returns 1 if no conversations exist for the role.
 * 
 * @param conversations - Map of all conversations
 * @param agentRole - The agent role to get the next instance number for
 * @returns The next instance number (1 if no conversations exist for this role)
 * 
 * @example
 * const conversations = new Map([
 *   ['project-manager-1', { agentRole: 'project-manager', instanceNumber: 1, ... }],
 *   ['project-manager-3', { agentRole: 'project-manager', instanceNumber: 3, ... }],
 * ])
 * getNextInstanceNumber(conversations, 'project-manager') // returns 4
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
