/**
 * Pure helper functions for conversation management.
 * Extracted from App.tsx to reduce monolith complexity.
 */

import type { Agent, Message, Conversation } from './conversationStorage'

/**
 * Generate conversation ID for an agent role and instance number.
 * Format: "{agentRole}-{instanceNumber}" (e.g., "implementation-agent-1")
 */
export function getConversationId(agentRole: Agent, instanceNumber: number): string {
  return `${agentRole}-${instanceNumber}`
}

/**
 * Parse conversation ID to get agent role and instance number.
 * Returns null if the ID format is invalid.
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
 * Scans existing conversations to find the highest instance number for the given role,
 * then returns that number + 1.
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
 * Format a Date object as a time string.
 * Format: "HH:mm:ss" (24-hour format, zero-padded)
 */
export function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

/**
 * Get a human-readable label for a message author.
 * Returns "You" for user messages, "HAL" for agent messages, "System" for system messages.
 */
export function getMessageAuthorLabel(agent: Message['agent']): string {
  if (agent === 'user') return 'You'
  if (agent === 'project-manager' || agent === 'implementation-agent' || agent === 'qa-agent' || agent === 'process-review-agent') return 'HAL'
  return 'System'
}
