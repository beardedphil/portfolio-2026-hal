import { describe, it, expect, beforeEach } from 'vitest'
import { getInitialTheme, THEME_STORAGE_KEY } from './theme'

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

describe('theme', () => {
  beforeEach(() => {
    localStorageMock.clear()
  })

  describe('THEME_STORAGE_KEY', () => {
    it('should be "hal-theme"', () => {
      expect(THEME_STORAGE_KEY).toBe('hal-theme')
    })
  })

  describe('getInitialTheme', () => {
    it('should return "light" when localStorage is missing', () => {
      expect(getInitialTheme()).toBe('light')
    })

    it('should return "light" when localStorage has "light"', () => {
      localStorage.setItem(THEME_STORAGE_KEY, 'light')
      expect(getInitialTheme()).toBe('light')
    })

    it('should return "dark" when localStorage has "dark"', () => {
      localStorage.setItem(THEME_STORAGE_KEY, 'dark')
      expect(getInitialTheme()).toBe('dark')
    })

    it('should return "light" (default) when localStorage has invalid value', () => {
      localStorage.setItem(THEME_STORAGE_KEY, 'invalid')
      expect(getInitialTheme()).toBe('light')
    })

    it('should return "light" (default) when localStorage has empty string', () => {
      localStorage.setItem(THEME_STORAGE_KEY, '')
      expect(getInitialTheme()).toBe('light')
    })

    it('should return "light" (default) when localStorage has null (via getItem returning null)', () => {
      // localStorage.getItem returns null for missing keys
      expect(localStorage.getItem('nonexistent-key')).toBe(null)
      expect(getInitialTheme()).toBe('light')
    })
  })
})
