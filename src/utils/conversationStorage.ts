/**
 * Conversation persistence: localStorage key helpers and save/load.
 */
import type { Agent, Conversation, ImageAttachment, Message } from '../types/hal'
import { CONVERSATION_STORAGE_PREFIX } from '../constants'
import { getConversationId, parseConversationId } from './conversationId'

export type SerializedImageAttachment = Omit<ImageAttachment, 'file'>
export type SerializedMessage = Omit<Message, 'timestamp' | 'imageAttachments'> & {
  timestamp: string
  imageAttachments?: SerializedImageAttachment[]
}
export type SerializedConversation = Omit<Conversation, 'messages' | 'createdAt'> & {
  messages: SerializedMessage[]
  createdAt: string
}

export function getStorageKey(projectName: string): string {
  return `${CONVERSATION_STORAGE_PREFIX}${projectName}`
}

// Re-export conversation ID helpers for convenience
export { getConversationId, parseConversationId }

export function getNextInstanceNumber(conversations: Map<string, Conversation>, agentRole: Agent): number {
  let maxNumber = 0
  for (const conv of conversations.values()) {
    if (conv.agentRole === agentRole && conv.instanceNumber > maxNumber) {
      maxNumber = conv.instanceNumber
    }
  }
  return maxNumber + 1
}

export function saveConversationsToStorage(
  projectName: string,
  conversations: Map<string, Conversation>
): { success: boolean; error?: string } {
  try {
    const serialized: SerializedConversation[] = []
    for (const conv of conversations.values()) {
      serialized.push({
        id: conv.id,
        agentRole: conv.agentRole,
        instanceNumber: conv.instanceNumber,
        createdAt: conv.createdAt.toISOString(),
        messages: conv.messages.map((msg) => ({
          ...msg,
          timestamp: msg.timestamp.toISOString(),
          imageAttachments: msg.imageAttachments?.map((img) => ({
            dataUrl: img.dataUrl,
            filename: img.filename,
          })),
        })),
      })
    }
    localStorage.setItem(getStorageKey(projectName), JSON.stringify(serialized))
    return { success: true }
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e)
    return { success: false, error: `Failed to save conversations: ${errMsg}` }
  }
}

export function loadConversationsFromStorage(
  projectName: string
): { success: boolean; conversations?: Map<string, Conversation>; error?: string } {
  try {
    const stored = localStorage.getItem(getStorageKey(projectName))
    if (!stored) {
      return { success: true, conversations: new Map() }
    }
    const serialized = JSON.parse(stored) as SerializedConversation[]
    const conversations = new Map<string, Conversation>()
    for (const ser of serialized) {
      conversations.set(ser.id, {
        id: ser.id,
        agentRole: ser.agentRole,
        instanceNumber: ser.instanceNumber,
        createdAt: new Date(ser.createdAt),
        messages: ser.messages.map((msg) => ({
          id: msg.id,
          agent: msg.agent,
          content: msg.content,
          timestamp: new Date(msg.timestamp),
          ...(msg.promptText && { promptText: msg.promptText }),
        })),
      })
    }
    return { success: true, conversations }
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e)
    return { success: false, error: `Failed to load conversations: ${errMsg}` }
  }
}

export function getEmptyConversations(): Map<string, Conversation> {
  return new Map()
}
