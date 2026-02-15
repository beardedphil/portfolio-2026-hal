/**
 * Conversation localStorage persistence module
 * 
 * Handles serialization and deserialization of conversation data to/from localStorage.
 * Provides resilient error handling for corrupted or missing data.
 * 
 * This module is split into smaller, testable modules:
 * - types: Type definitions
 * - storage-keys: Storage key helpers
 * - validation: Validation logic
 * - serialization: Serialization/deserialization
 * - persistence: Main save/load functions
 */

// Re-export types
export type {
  Agent,
  ImageAttachment,
  Message,
  Conversation,
} from './types'

// Re-export main functions
export {
  saveConversationsToStorage,
  loadConversationsFromStorage,
} from './persistence'
