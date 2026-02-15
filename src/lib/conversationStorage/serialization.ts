/**
 * Serialization and deserialization logic for conversations.
 */

import type {
  Conversation,
  Message,
  SerializedConversation,
  SerializedMessage,
} from './types'

/**
 * Serializes a conversation to a format suitable for localStorage.
 * 
 * @param conversation - The conversation to serialize
 * @returns The serialized conversation
 */
export function serializeConversation(conversation: Conversation): SerializedConversation {
  return {
    id: conversation.id,
    agentRole: conversation.agentRole,
    instanceNumber: conversation.instanceNumber,
    createdAt: conversation.createdAt.toISOString(),
    messages: conversation.messages.map((msg) => serializeMessage(msg)),
    oldestLoadedSequence: conversation.oldestLoadedSequence,
    hasMoreMessages: conversation.hasMoreMessages,
  }
}

/**
 * Serializes a message to a format suitable for localStorage.
 * 
 * @param message - The message to serialize
 * @returns The serialized message
 */
function serializeMessage(message: Message): SerializedMessage {
  return {
    ...message,
    timestamp: message.timestamp.toISOString(),
    imageAttachments: message.imageAttachments?.map((img) => ({
      dataUrl: img.dataUrl,
      filename: img.filename,
    })),
  }
}

/**
 * Deserializes a conversation from localStorage format.
 * 
 * @param serialized - The serialized conversation
 * @returns The deserialized conversation, or null if deserialization fails
 */
export function deserializeConversation(
  serialized: SerializedConversation
): Conversation | null {
  try {
    // Validate date strings can be parsed
    const createdAt = new Date(serialized.createdAt)
    if (isNaN(createdAt.getTime())) {
      return null
    }
    
    // Deserialize messages with validation
    const messages: Message[] = []
    for (const msg of serialized.messages) {
      const msgTimestamp = new Date(msg.timestamp)
      if (isNaN(msgTimestamp.getTime())) {
        continue // Skip messages with invalid timestamps
      }
      
      messages.push({
        id: msg.id,
        agent: msg.agent,
        content: msg.content,
        timestamp: msgTimestamp,
        ...(msg.promptText && { promptText: msg.promptText }),
        // imageAttachments from serialized data don't have File objects, so omit them
        // File objects can't be restored from localStorage
      })
    }
    
    return {
      id: serialized.id,
      agentRole: serialized.agentRole,
      instanceNumber: serialized.instanceNumber,
      createdAt,
      messages,
      oldestLoadedSequence: serialized.oldestLoadedSequence,
      hasMoreMessages: serialized.hasMoreMessages,
    }
  } catch {
    return null
  }
}
