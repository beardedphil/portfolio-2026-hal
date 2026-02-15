import { describe, it, expect, beforeEach } from 'vitest'
import { getMetricColor, getInitialTheme, THEME_STORAGE_KEY } from './metricColor'
import type { Theme } from '../types/hal'

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

describe('metricColor', () => {
  beforeEach(() => {
    localStorageMock.clear()
  })

  describe('getMetricColor', () => {
    it('should return gray (#888888) for null', () => {
      expect(getMetricColor(null)).toBe('#888888')
    })

    it('should return red color for 0%', () => {
      const color = getMetricColor(0)
      expect(color).toBe('rgb(220, 53, 69)') // Red: rgb(220, 53, 69)
    })

    it('should return green color for 100%', () => {
      const color = getMetricColor(100)
      expect(color).toBe('rgb(40, 167, 69)') // Green: rgb(40, 167, 69)
    })

    it('should return intermediate color for 50%', () => {
      const color = getMetricColor(50)
      // At 50%, we should be halfway between red and green
      // Red: rgb(220, 53, 69)
      // Green: rgb(40, 167, 69)
      // Midpoint: rgb(130, 110, 69)
      expect(color).toBe('rgb(130, 110, 69)')
    })

    it('should handle out-of-range values (negative)', () => {
      // For negative values, the calculation will still work but produce a color
      // beyond red (more red than red). Let's verify it doesn't crash.
      const color = getMetricColor(-10)
      expect(color).toMatch(/^rgb\(\d+, \d+, \d+\)$/)
      // Should be even more red than 0%
      const r = parseInt(color.match(/\d+/)?.[0] || '0')
      expect(r).toBeGreaterThan(220) // More red than the red endpoint
    })

    it('should handle out-of-range values (over 100)', () => {
      // For values over 100, the calculation will produce a color beyond green
      // This can result in negative RGB values, which is fine - the function doesn't clamp
      const color = getMetricColor(150)
      // Match RGB format, including negative numbers
      expect(color).toMatch(/^rgb\(-?\d+, -?\d+, -?\d+\)$/)
      // Should be even more green than 100% (less red)
      const rMatch = color.match(/-?\d+/)?.[0]
      const r = parseInt(rMatch || '0')
      expect(r).toBeLessThan(40) // Less red than the green endpoint
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

  describe('THEME_STORAGE_KEY', () => {
    it('should be "hal-theme"', () => {
      expect(THEME_STORAGE_KEY).toBe('hal-theme')
    })
  })
})
