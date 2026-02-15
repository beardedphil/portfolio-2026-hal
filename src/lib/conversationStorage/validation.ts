/**
 * Validation logic for serialized conversation data.
 */

import type { Agent, SerializedConversation } from './types'

/**
 * Validates that a serialized conversation has the required structure.
 * 
 * @param data - The data to validate
 * @returns True if the data is a valid SerializedConversation
 */
export function validateSerializedConversation(data: unknown): data is SerializedConversation {
  if (!data || typeof data !== 'object') return false
  
  const conv = data as Record<string, unknown>
  
  // Check required fields
  if (typeof conv.id !== 'string' || !conv.id) return false
  if (typeof conv.agentRole !== 'string') return false
  if (typeof conv.instanceNumber !== 'number') return false
  if (typeof conv.createdAt !== 'string') return false
  if (!Array.isArray(conv.messages)) return false
  
  // Validate agentRole is a valid Agent
  const validAgents: Agent[] = ['project-manager', 'implementation-agent', 'qa-agent', 'process-review-agent']
  if (!validAgents.includes(conv.agentRole as Agent)) return false
  
  // Validate messages structure
  for (const msg of conv.messages) {
    if (!msg || typeof msg !== 'object') return false
    const message = msg as Record<string, unknown>
    if (typeof message.id !== 'number') return false
    if (typeof message.agent !== 'string') return false
    if (typeof message.content !== 'string') return false
    if (typeof message.timestamp !== 'string') return false
  }
  
  return true
}
