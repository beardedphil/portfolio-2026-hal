/**
 * Helper module for calculating QA metric colors and theme initialization.
 */

/**
 * Calculate color gradient from red (0%) to green (100%) for QA metrics.
 * Returns gray for null values.
 * 
 * @param percentage - The metric percentage (0-100) or null for N/A
 * @returns RGB color string (e.g., "rgb(220, 53, 69)")
 */
export function getMetricColor(percentage: number | null): string {
  if (percentage === null) {
    return '#888888' // Gray for N/A
  }
  // Red (0%) to Green (100%) gradient
  // Red: rgb(220, 53, 69) or #dc3545
  // Green: rgb(40, 167, 69) or #28a745
  const red = 220
  const green = 40
  const blueRed = 53
  const blueGreen = 167
  const greenRed = 69
  const greenGreen = 69
  const r = Math.round(red + (green - red) * (percentage / 100))
  const g = Math.round(blueRed + (blueGreen - blueRed) * (percentage / 100))
  const b = Math.round(greenRed + (greenGreen - greenRed) * (percentage / 100))
  return `rgb(${r}, ${g}, ${b})`
}

export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'hal-theme'

/**
 * Reads the initial theme from localStorage.
 * Returns 'light' as default if the value is missing or invalid.
 * 
 * @returns The theme ('light' or 'dark')
 */
export function getInitialTheme(): Theme {
  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') {
    return stored
  }
  return 'light' // default
}
