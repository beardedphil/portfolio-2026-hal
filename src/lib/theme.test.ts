import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getInitialTheme, THEME_STORAGE_KEY, type Theme } from './theme'

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

  describe('getInitialTheme', () => {
    it('should load stored "dark" theme as "dark"', () => {
      localStorage.setItem(THEME_STORAGE_KEY, 'dark')
      const theme = getInitialTheme()
      expect(theme).toBe('dark')
    })

    it('should load stored "light" theme as "light"', () => {
      localStorage.setItem(THEME_STORAGE_KEY, 'light')
      const theme = getInitialTheme()
      expect(theme).toBe('light')
    })

    it('should fall back to "light" when storage is missing', () => {
      // localStorage is empty
      const theme = getInitialTheme()
      expect(theme).toBe('light')
    })

    it('should fall back to "light" when stored value is invalid', () => {
      localStorage.setItem(THEME_STORAGE_KEY, 'invalid')
      const theme = getInitialTheme()
      expect(theme).toBe('light')
    })

    it('should fall back to "light" when stored value is empty string', () => {
      localStorage.setItem(THEME_STORAGE_KEY, '')
      const theme = getInitialTheme()
      expect(theme).toBe('light')
    })

    it('should fall back to "light" when stored value is null', () => {
      // Simulate localStorage.getItem returning null
      localStorage.setItem(THEME_STORAGE_KEY, 'null')
      // Actually, let's test the real case where getItem returns null
      const originalGetItem = localStorage.getItem
      localStorage.getItem = vi.fn(() => null)
      const theme = getInitialTheme()
      expect(theme).toBe('light')
      localStorage.getItem = originalGetItem
    })
  })
})
