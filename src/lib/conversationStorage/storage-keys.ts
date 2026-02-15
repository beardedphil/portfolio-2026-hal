/**
 * Storage key helpers for conversation persistence.
 */

const CONVERSATION_STORAGE_PREFIX = 'hal-chat-conversations-'

/**
 * Gets the localStorage key for a project's conversations.
 * 
 * @param projectName - The project name to use as storage key
 * @returns The full storage key string
 */
export function getStorageKey(projectName: string): string {
  return `${CONVERSATION_STORAGE_PREFIX}${projectName}`
}
