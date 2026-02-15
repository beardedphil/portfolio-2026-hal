import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getChatWidth,
  setChatWidth,
  getChatCollapsed,
  setChatCollapsed,
} from './persistedUiState'

// Mock localStorage
const localStorageMock = (() => {
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

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
})

describe('persistedUiState', () => {
  beforeEach(() => {
    localStorageMock.clear()
  })

  describe('getChatWidth', () => {
    it('should return valid width for valid numbers within range', () => {
      localStorage.setItem('hal-chat-width', '500')
      expect(getChatWidth()).toBe(500)

      localStorage.setItem('hal-chat-width', '320')
      expect(getChatWidth()).toBe(320)

      localStorage.setItem('hal-chat-width', '800')
      expect(getChatWidth()).toBe(800)

      localStorage.setItem('hal-chat-width', '400')
      expect(getChatWidth()).toBe(400)
    })

    it('should return default (400) for invalid values', () => {
      // NaN
      localStorage.setItem('hal-chat-width', 'not-a-number')
      expect(getChatWidth()).toBe(400)

      // Empty string
      localStorage.setItem('hal-chat-width', '')
      expect(getChatWidth()).toBe(400)

      // Out of range - too small
      localStorage.setItem('hal-chat-width', '319')
      expect(getChatWidth()).toBe(400)

      // Out of range - too large
      localStorage.setItem('hal-chat-width', '801')
      expect(getChatWidth()).toBe(400)

      // Negative number
      localStorage.setItem('hal-chat-width', '-100')
      expect(getChatWidth()).toBe(400)

      // Zero
      localStorage.setItem('hal-chat-width', '0')
      expect(getChatWidth()).toBe(400)
    })

    it('should return default (400) when value is missing', () => {
      expect(getChatWidth()).toBe(400)
    })

    it('should handle localStorage errors gracefully', () => {
      // Mock localStorage.getItem to throw
      const originalGetItem = localStorage.getItem
      localStorage.getItem = vi.fn(() => {
        throw new Error('localStorage error')
      })

      expect(getChatWidth()).toBe(400)

      // Restore
      localStorage.getItem = originalGetItem
    })
  })

  describe('setChatWidth', () => {
    it('should persist valid width values', () => {
      setChatWidth(500)
      expect(localStorage.getItem('hal-chat-width')).toBe('500')

      setChatWidth(320)
      expect(localStorage.getItem('hal-chat-width')).toBe('320')

      setChatWidth(800)
      expect(localStorage.getItem('hal-chat-width')).toBe('800')
    })

    it('should handle localStorage errors gracefully', () => {
      // Mock localStorage.setItem to throw
      const originalSetItem = localStorage.setItem
      localStorage.setItem = vi.fn(() => {
        throw new Error('Storage quota exceeded')
      })

      // Should not throw
      expect(() => setChatWidth(500)).not.toThrow()

      // Restore
      localStorage.setItem = originalSetItem
    })
  })

  describe('getChatCollapsed', () => {
    it('should return true for "true" string', () => {
      localStorage.setItem('hal-chat-collapsed', 'true')
      expect(getChatCollapsed()).toBe(true)
    })

    it('should return false for "false" string', () => {
      localStorage.setItem('hal-chat-collapsed', 'false')
      expect(getChatCollapsed()).toBe(false)
    })

    it('should return false (default) for invalid values', () => {
      // Empty string
      localStorage.setItem('hal-chat-collapsed', '')
      expect(getChatCollapsed()).toBe(false)

      // Invalid string
      localStorage.setItem('hal-chat-collapsed', 'yes')
      expect(getChatCollapsed()).toBe(false)

      // Number as string
      localStorage.setItem('hal-chat-collapsed', '1')
      expect(getChatCollapsed()).toBe(false)

      // Case-sensitive - uppercase
      localStorage.setItem('hal-chat-collapsed', 'TRUE')
      expect(getChatCollapsed()).toBe(false)
    })

    it('should return false (default) when value is missing', () => {
      expect(getChatCollapsed()).toBe(false)
    })

    it('should handle localStorage errors gracefully', () => {
      // Mock localStorage.getItem to throw
      const originalGetItem = localStorage.getItem
      localStorage.getItem = vi.fn(() => {
        throw new Error('localStorage error')
      })

      expect(getChatCollapsed()).toBe(false)

      // Restore
      localStorage.getItem = originalGetItem
    })
  })

  describe('setChatCollapsed', () => {
    it('should persist true as "true" string', () => {
      setChatCollapsed(true)
      expect(localStorage.getItem('hal-chat-collapsed')).toBe('true')
    })

    it('should persist false as "false" string', () => {
      setChatCollapsed(false)
      expect(localStorage.getItem('hal-chat-collapsed')).toBe('false')
    })

    it('should handle localStorage errors gracefully', () => {
      // Mock localStorage.setItem to throw
      const originalSetItem = localStorage.setItem
      localStorage.setItem = vi.fn(() => {
        throw new Error('Storage quota exceeded')
      })

      // Should not throw
      expect(() => setChatCollapsed(true)).not.toThrow()
      expect(() => setChatCollapsed(false)).not.toThrow()

      // Restore
      localStorage.setItem = originalSetItem
    })
  })

  describe('round-trip persistence', () => {
    it('should persist and retrieve chat width correctly', () => {
      setChatWidth(600)
      expect(getChatWidth()).toBe(600)

      setChatWidth(450)
      expect(getChatWidth()).toBe(450)
    })

    it('should persist and retrieve chat collapsed state correctly', () => {
      setChatCollapsed(true)
      expect(getChatCollapsed()).toBe(true)

      setChatCollapsed(false)
      expect(getChatCollapsed()).toBe(false)
    })
  })
})
