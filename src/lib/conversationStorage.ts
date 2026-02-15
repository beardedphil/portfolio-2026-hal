/**
 * Conversation localStorage persistence module
 * 
 * Handles serialization and deserialization of conversation data to/from localStorage.
 * Provides resilient error handling for corrupted or missing data.
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
type SerializedImageAttachment = Omit<ImageAttachment, 'file'> // File objects can't be serialized
type SerializedMessage = Omit<Message, 'timestamp' | 'imageAttachments'> & { 
  timestamp: string
  imageAttachments?: SerializedImageAttachment[]
}
type SerializedConversation = Omit<Conversation, 'messages' | 'createdAt'> & {
  messages: SerializedMessage[]
  createdAt: string
}

const CONVERSATION_STORAGE_PREFIX = 'hal-chat-conversations-'

function getStorageKey(projectName: string): string {
  return `${CONVERSATION_STORAGE_PREFIX}${projectName}`
}

/**
 * Validates that a serialized conversation has the required structure
 */
function validateSerializedConversation(data: unknown): data is SerializedConversation {
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

/**
 * Saves conversations to localStorage
 * 
 * @param projectName - The project name to use as storage key
 * @param conversations - Map of conversation ID to Conversation objects
 * @returns Result object with success status and optional error message
 */
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

/**
 * Loads conversations from localStorage with resilient error handling
 * 
 * If data is corrupted or missing, returns an empty Map and a clear error message
 * that can be displayed to the user in Diagnostics.
 * 
 * @param projectName - The project name to use as storage key
 * @returns Result object with success status, conversations Map, and optional error message
 */
export function loadConversationsFromStorage(
  projectName: string
): { success: boolean; conversations?: Map<string, Conversation>; error?: string; wasReset?: boolean } {
  try {
    const stored = localStorage.getItem(getStorageKey(projectName))
    if (!stored) {
      // No stored data is not an error - just return empty Map
      return { success: true, conversations: new Map() }
    }
    
    // Attempt to parse JSON
    let serialized: unknown
    try {
      serialized = JSON.parse(stored)
    } catch (parseError) {
      // Corrupted JSON - clear it and return empty
      try {
        localStorage.removeItem(getStorageKey(projectName))
      } catch {
        // Ignore errors when clearing corrupted data
      }
      return {
        success: false,
        conversations: new Map(),
        error: 'Conversation history was corrupted and has been reset. Your previous conversations could not be restored.',
        wasReset: true,
      }
    }
    
    // Validate that parsed data is an array
    if (!Array.isArray(serialized)) {
      try {
        localStorage.removeItem(getStorageKey(projectName))
      } catch {
        // Ignore errors when clearing corrupted data
      }
      return {
        success: false,
        conversations: new Map(),
        error: 'Conversation history was corrupted and has been reset. Your previous conversations could not be restored.',
        wasReset: true,
      }
    }
    
    // Validate and deserialize each conversation
    const conversations = new Map<string, Conversation>()
    const invalidConversations: string[] = []
    
    for (const ser of serialized) {
      if (!validateSerializedConversation(ser)) {
        invalidConversations.push(ser?.id || 'unknown')
        continue // Skip invalid conversations
      }
      
      try {
        // Validate date strings can be parsed
        const createdAt = new Date(ser.createdAt)
        if (isNaN(createdAt.getTime())) {
          invalidConversations.push(ser.id)
          continue
        }
        
        // Deserialize messages with validation
        const messages: Message[] = []
        for (const msg of ser.messages) {
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
        
        conversations.set(ser.id, {
          id: ser.id,
          agentRole: ser.agentRole,
          instanceNumber: ser.instanceNumber,
          createdAt,
          messages,
          oldestLoadedSequence: ser.oldestLoadedSequence,
          hasMoreMessages: ser.hasMoreMessages,
        })
      } catch (convError) {
        // Skip conversations that fail to deserialize
        invalidConversations.push(ser.id)
      }
    }
    
    // If we had invalid conversations, clear corrupted data and show error
    if (invalidConversations.length > 0) {
      // If all conversations were invalid, clear storage
      if (conversations.size === 0) {
        try {
          localStorage.removeItem(getStorageKey(projectName))
        } catch {
          // Ignore errors when clearing corrupted data
        }
        return {
          success: false,
          conversations: new Map(),
          error: 'Conversation history was corrupted and has been reset. Your previous conversations could not be restored.',
          wasReset: true,
        }
      }
      
      // Some conversations were valid, but some were invalid
      // Save the valid ones back to storage
      try {
        saveConversationsToStorage(projectName, conversations)
      } catch {
        // Ignore errors when saving cleaned data
      }
      
      return {
        success: true,
        conversations,
        error: `Some conversations were corrupted and could not be restored. ${conversations.size} conversation(s) were recovered.`,
      }
    }
    
    return { success: true, conversations }
  } catch (e) {
    // Unexpected error - clear storage and return empty
    try {
      localStorage.removeItem(getStorageKey(projectName))
    } catch {
      // Ignore errors when clearing corrupted data
    }
    const errMsg = e instanceof Error ? e.message : String(e)
    return {
      success: false,
      conversations: new Map(),
      error: `Conversation history was reset due to an error: ${errMsg}. Your previous conversations could not be restored.`,
      wasReset: true,
    }
  }
}
