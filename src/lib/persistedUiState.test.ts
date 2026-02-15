import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getChatWidth, setChatWidth, getChatCollapsed, setChatCollapsed } from './persistedUiState'

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
    it('should return valid width when stored value is valid', () => {
      localStorage.setItem('hal-chat-width', '500')
      expect(getChatWidth()).toBe(500)
    })

    it('should return default width (400) when value is missing', () => {
      expect(getChatWidth()).toBe(400)
    })

    it('should return default width when value is NaN', () => {
      localStorage.setItem('hal-chat-width', 'not-a-number')
      expect(getChatWidth()).toBe(400)
    })

    it('should return default width when value is empty string', () => {
      localStorage.setItem('hal-chat-width', '')
      expect(getChatWidth()).toBe(400)
    })

    it('should return default width when value is below minimum (320)', () => {
      localStorage.setItem('hal-chat-width', '100')
      expect(getChatWidth()).toBe(400)
    })

    it('should return default width when value is above maximum (800)', () => {
      localStorage.setItem('hal-chat-width', '1000')
      expect(getChatWidth()).toBe(400)
    })

    it('should return value at minimum boundary (320)', () => {
      localStorage.setItem('hal-chat-width', '320')
      expect(getChatWidth()).toBe(320)
    })

    it('should return value at maximum boundary (800)', () => {
      localStorage.setItem('hal-chat-width', '800')
      expect(getChatWidth()).toBe(800)
    })

    it('should handle localStorage errors gracefully', () => {
      const originalGetItem = localStorage.getItem
      localStorage.getItem = vi.fn(() => {
        throw new Error('localStorage error')
      })

      expect(getChatWidth()).toBe(400)

      localStorage.getItem = originalGetItem
    })
  })

  describe('setChatWidth', () => {
    it('should store width as string', () => {
      setChatWidth(500)
      expect(localStorage.getItem('hal-chat-width')).toBe('500')
    })

    it('should handle localStorage errors gracefully', () => {
      const originalSetItem = localStorage.setItem
      localStorage.setItem = vi.fn(() => {
        throw new Error('Storage quota exceeded')
      })

      // Should not throw
      expect(() => setChatWidth(500)).not.toThrow()

      localStorage.setItem = originalSetItem
    })
  })

  describe('getChatCollapsed', () => {
    it('should return true when stored value is "true"', () => {
      localStorage.setItem('hal-chat-collapsed', 'true')
      expect(getChatCollapsed()).toBe(true)
    })

    it('should return false when stored value is "false"', () => {
      localStorage.setItem('hal-chat-collapsed', 'false')
      expect(getChatCollapsed()).toBe(false)
    })

    it('should return false (default) when value is missing', () => {
      expect(getChatCollapsed()).toBe(false)
    })

    it('should return false when value is empty string', () => {
      localStorage.setItem('hal-chat-collapsed', '')
      expect(getChatCollapsed()).toBe(false)
    })

    it('should return false when value is invalid (not "true")', () => {
      localStorage.setItem('hal-chat-collapsed', 'yes')
      expect(getChatCollapsed()).toBe(false)
    })

    it('should return false when value is "True" (case-sensitive)', () => {
      localStorage.setItem('hal-chat-collapsed', 'True')
      expect(getChatCollapsed()).toBe(false)
    })

    it('should handle localStorage errors gracefully', () => {
      const originalGetItem = localStorage.getItem
      localStorage.getItem = vi.fn(() => {
        throw new Error('localStorage error')
      })

      expect(getChatCollapsed()).toBe(false)

      localStorage.getItem = originalGetItem
    })
  })

  describe('setChatCollapsed', () => {
    it('should store true as "true"', () => {
      setChatCollapsed(true)
      expect(localStorage.getItem('hal-chat-collapsed')).toBe('true')
    })

    it('should store false as "false"', () => {
      setChatCollapsed(false)
      expect(localStorage.getItem('hal-chat-collapsed')).toBe('false')
    })

    it('should handle localStorage errors gracefully', () => {
      const originalSetItem = localStorage.setItem
      localStorage.setItem = vi.fn(() => {
        throw new Error('Storage quota exceeded')
      })

      // Should not throw
      expect(() => setChatCollapsed(true)).not.toThrow()

      localStorage.setItem = originalSetItem
    })
  })
})
