/**
 * Theme persistence helper module
 * 
 * Handles reading and writing theme preferences to/from localStorage.
 * Provides a simple API for theme initialization with fallback to 'light' default.
 */

export type Theme = 'light' | 'dark'

/**
 * Storage key used for persisting theme preference in localStorage.
 */
export const THEME_STORAGE_KEY = 'hal-theme'

/**
 * Reads the initial theme from localStorage.
 * 
 * @returns The stored theme if it's 'light' or 'dark', otherwise defaults to 'light'.
 */
export function getInitialTheme(): Theme {
  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') {
    return stored
  }
  return 'light' // default
}
