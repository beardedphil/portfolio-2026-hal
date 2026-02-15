/**
 * Main persistence functions for saving and loading conversations from localStorage.
 * Provides resilient error handling for corrupted or missing data.
 */

import { getStorageKey } from './storage-keys'
import { validateSerializedConversation } from './validation'
import { serializeConversation, deserializeConversation } from './serialization'
import type { Conversation } from './types'

/**
 * Saves conversations to localStorage.
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
    const serialized = Array.from(conversations.values()).map(serializeConversation)
    localStorage.setItem(getStorageKey(projectName), JSON.stringify(serialized))
    return { success: true }
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e)
    return { success: false, error: `Failed to save conversations: ${errMsg}` }
  }
}

/**
 * Loads conversations from localStorage with resilient error handling.
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
      clearStorage(projectName)
      return {
        success: false,
        conversations: new Map(),
        error: 'Conversation history was corrupted and has been reset. Your previous conversations could not be restored.',
        wasReset: true,
      }
    }
    
    // Validate that parsed data is an array
    if (!Array.isArray(serialized)) {
      clearStorage(projectName)
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
      
      const deserialized = deserializeConversation(ser)
      if (!deserialized) {
        invalidConversations.push(ser.id)
        continue
      }
      
      conversations.set(ser.id, deserialized)
    }
    
    // If we had invalid conversations, handle recovery
    if (invalidConversations.length > 0) {
      return handleInvalidConversations(projectName, conversations)
    }
    
    return { success: true, conversations }
  } catch (e) {
    // Unexpected error - clear storage and return empty
    clearStorage(projectName)
    const errMsg = e instanceof Error ? e.message : String(e)
    return {
      success: false,
      conversations: new Map(),
      error: `Conversation history was reset due to an error: ${errMsg}. Your previous conversations could not be restored.`,
      wasReset: true,
    }
  }
}

/**
 * Clears corrupted storage for a project.
 */
function clearStorage(projectName: string): void {
  try {
    localStorage.removeItem(getStorageKey(projectName))
  } catch {
    // Ignore errors when clearing corrupted data
  }
}

/**
 * Handles recovery when some conversations are invalid.
 */
function handleInvalidConversations(
  projectName: string,
  conversations: Map<string, Conversation>
): { success: boolean; conversations: Map<string, Conversation>; error?: string; wasReset?: boolean } {
  // If all conversations were invalid, clear storage
  if (conversations.size === 0) {
    clearStorage(projectName)
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
