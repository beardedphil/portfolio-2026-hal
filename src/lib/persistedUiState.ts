/**
 * Helper module for persisting and reading chat UI state from localStorage.
 * Handles parsing, validation, and default values safely.
 */

const CHAT_WIDTH_KEY = 'hal-chat-width'
const CHAT_COLLAPSED_KEY = 'hal-chat-collapsed'

const DEFAULT_CHAT_WIDTH = 400
const MIN_CHAT_WIDTH = 320
const MAX_CHAT_WIDTH = 800

/**
 * Reads the persisted chat width from localStorage.
 * Returns the default width (400) if the value is missing or invalid.
 * 
 * @returns The chat width in pixels (320-800), or 400 as default
 */
export function getChatWidth(): number {
  try {
    const saved = localStorage.getItem(CHAT_WIDTH_KEY)
    if (saved) {
      const parsed = parseInt(saved, 10)
      if (!isNaN(parsed) && parsed >= MIN_CHAT_WIDTH && parsed <= MAX_CHAT_WIDTH) {
        return parsed
      }
    }
  } catch {
    // ignore localStorage errors (e.g., in SSR or private browsing)
  }
  return DEFAULT_CHAT_WIDTH
}

/**
 * Writes the chat width to localStorage.
 * Silently handles errors (e.g., quota exceeded, private browsing).
 * 
 * @param width - The chat width in pixels to persist
 */
export function setChatWidth(width: number): void {
  try {
    localStorage.setItem(CHAT_WIDTH_KEY, String(width))
  } catch {
    // ignore localStorage errors
  }
}

/**
 * Reads the persisted chat collapsed state from localStorage.
 * Returns false (expanded) if the value is missing or invalid.
 * 
 * @returns true if chat is collapsed, false if expanded (default)
 */
export function getChatCollapsed(): boolean {
  try {
    const saved = localStorage.getItem(CHAT_COLLAPSED_KEY)
    if (saved) {
      return saved === 'true'
    }
  } catch {
    // ignore localStorage errors
  }
  return false // default to expanded
}

/**
 * Writes the chat collapsed state to localStorage.
 * Silently handles errors (e.g., quota exceeded, private browsing).
 * 
 * @param collapsed - true if chat should be collapsed, false if expanded
 */
export function setChatCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(CHAT_COLLAPSED_KEY, String(collapsed))
  } catch {
    // ignore localStorage errors
  }
}
