/**
 * Shared test helpers for conversationStorage tests
 */

// Mock localStorage
export const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
  }
})()

// Setup localStorage mock
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
})
