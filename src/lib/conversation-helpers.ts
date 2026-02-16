// Pure helper functions for conversation management
// Extracted from src/App.tsx to reduce monolith complexity

import type { Agent, Conversation } from './conversationStorage'

/**
 * Generate conversation ID for an agent role and instance number
 * @param agentRole - The agent role (e.g., 'implementation-agent')
 * @param instanceNumber - The instance number (e.g., 1, 2, 3)
 * @returns Conversation ID string (e.g., "implementation-agent-1")
 */
export function getConversationId(agentRole: Agent, instanceNumber: number): string {
  return `${agentRole}-${instanceNumber}`
}

/**
 * Parse conversation ID to get agent role and instance number
 * @param conversationId - The conversation ID string (e.g., "implementation-agent-1")
 * @returns Object with agentRole and instanceNumber, or null if invalid
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
 * Get next instance number for an agent role
 * @param conversations - Map of all conversations
 * @param agentRole - The agent role to get next instance for
 * @returns Next available instance number (starts at 1 if no conversations exist)
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

/**
 * Format a Date object as a time string (HH:MM:SS)
 * @param date - The date to format
 * @returns Formatted time string (e.g., "14:30:45")
 */
export function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

/**
 * Get display label for a message author
 * @param agent - The agent type from the message
 * @returns Display label ("You", "HAL", or "System")
 */
export function getMessageAuthorLabel(agent: Agent | 'user' | 'system'): string {
  if (agent === 'user') return 'You'
  if (agent === 'project-manager' || agent === 'implementation-agent' || agent === 'qa-agent' || agent === 'process-review-agent') return 'HAL'
  return 'System'
}
