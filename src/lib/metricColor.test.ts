import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getMetricColor, getInitialTheme, THEME_STORAGE_KEY, type Theme } from './metricColor'

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
    it('should return gray for null', () => {
      expect(getMetricColor(null)).toBe('#888888')
    })

    it('should return red color for 0%', () => {
      const color = getMetricColor(0)
      expect(color).toBe('rgb(220, 53, 69)') // Red color
    })

    it('should return green color for 100%', () => {
      const color = getMetricColor(100)
      expect(color).toBe('rgb(40, 167, 69)') // Green color
    })

    it('should return intermediate color for 50%', () => {
      const color = getMetricColor(50)
      // At 50%, should be halfway between red and green
      // Red: rgb(220, 53, 69)
      // Green: rgb(40, 167, 69)
      // Midpoint: rgb(130, 110, 69)
      expect(color).toBe('rgb(130, 110, 69)')
    })

    it('should handle out-of-range values (negative)', () => {
      // For negative values, the calculation will still work but produce a color
      // beyond the red end of the gradient
      const color = getMetricColor(-10)
      // Should calculate: red + (green - red) * (-10 / 100) = red - 0.1 * (green - red)
      // This will produce a color more red than the base red
      expect(color).toMatch(/^rgb\(\d+, \d+, \d+\)$/)
      // Verify it's a valid RGB string
    })

    it('should handle out-of-range values (over 100)', () => {
      // For values over 100, the calculation will still work but produce a color
      // beyond the green end of the gradient (may include negative values)
      const color = getMetricColor(150)
      // Should calculate: red + (green - red) * (150 / 100) = red + 1.5 * (green - red)
      // This will produce a color more green than the base green
      // Note: This can produce negative RGB values, which is the defined behavior
      expect(color).toMatch(/^rgb\(-?\d+, -?\d+, -?\d+\)$/)
      // Verify it's a valid RGB string (with optional negative sign)
    })
  })

  describe('getInitialTheme', () => {
    it('should return "light" when localStorage is "light"', () => {
      localStorage.setItem(THEME_STORAGE_KEY, 'light')
      expect(getInitialTheme()).toBe('light')
    })

    it('should return "dark" when localStorage is "dark"', () => {
      localStorage.setItem(THEME_STORAGE_KEY, 'dark')
      expect(getInitialTheme()).toBe('dark')
    })

    it('should return "light" (default) when localStorage is missing', () => {
      // localStorage is cleared in beforeEach
      expect(getInitialTheme()).toBe('light')
    })

    it('should return "light" (default) when localStorage has invalid value', () => {
      localStorage.setItem(THEME_STORAGE_KEY, 'invalid')
      expect(getInitialTheme()).toBe('light')
    })

    it('should return "light" (default) when localStorage has empty string', () => {
      localStorage.setItem(THEME_STORAGE_KEY, '')
      expect(getInitialTheme()).toBe('light')
    })
  })
})
