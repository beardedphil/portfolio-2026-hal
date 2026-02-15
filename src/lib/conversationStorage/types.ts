/**
 * Type definitions for conversation storage.
 * Re-exports types from the main types file for module consistency.
 */

export type Agent = 'project-manager' | 'implementation-agent' | 'qa-agent' | 'process-review-agent'

export type ImageAttachment = {
  file: File
  dataUrl: string // base64 data URL for preview
  filename: string
}

export type Message = {
  id: number
  agent: Agent | 'user' | 'system'
  content: string
  timestamp: Date
  imageAttachments?: ImageAttachment[] // Optional array of image attachments
  /** Full prompt text sent to LLM for this message (0202) - only for assistant messages */
  promptText?: string
}

export type Conversation = {
  id: string // e.g., "implementation-agent-1", "qa-agent-2"
  agentRole: Agent // The agent role this conversation belongs to
  instanceNumber: number // 1, 2, 3, etc.
  messages: Message[]
  createdAt: Date
  oldestLoadedSequence?: number // Track oldest message sequence loaded (for pagination)
  hasMoreMessages?: boolean // Whether there are more messages to load
}

// Serialized types for localStorage
export type SerializedImageAttachment = Omit<ImageAttachment, 'file'> // File objects can't be serialized
export type SerializedMessage = Omit<Message, 'timestamp' | 'imageAttachments'> & {
  timestamp: string
  imageAttachments?: SerializedImageAttachment[]
}
export type SerializedConversation = Omit<Conversation, 'messages' | 'createdAt'> & {
  messages: SerializedMessage[]
  createdAt: string
}
