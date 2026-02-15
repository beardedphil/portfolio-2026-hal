import type { Agent, Conversation } from './conversationStorage/types'

/**
 * Generate a conversation ID from agent role and instance number.
 * Format: "{agentRole}-{instanceNumber}"
 * Example: "project-manager-1", "implementation-agent-2"
 */
export function getConversationId(agentRole: Agent, instanceNumber: number): string {
  return `${agentRole}-${instanceNumber}`
}

/**
 * Parse conversation ID to get agent role and instance number.
 * Returns null if the ID format is invalid.
 * 
 * Valid format: "{agentRole}-{instanceNumber}"
 * Example: "project-manager-1" -> { agentRole: 'project-manager', instanceNumber: 1 }
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
 * Get the next instance number for an agent role based on existing conversations.
 * Returns 1 if no conversations exist for the agent role.
 * 
 * Example: If conversations contain "project-manager-1" and "project-manager-3",
 * this will return 4 (max + 1).
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
