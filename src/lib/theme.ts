/**
 * Theme persistence helper module.
 * 
 * Handles reading and writing theme preferences to localStorage.
 */

export type Theme = 'light' | 'dark'

/**
 * Storage key used for persisting theme preference in localStorage.
 */
export const THEME_STORAGE_KEY = 'hal-theme'

/**
 * Reads the initial theme from localStorage.
 * 
 * @returns The stored theme ('light' or 'dark'), or 'light' as the default
 *          if storage is missing or contains an invalid value.
 */
export function getInitialTheme(): Theme {
  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') {
    return stored
  }
  return 'light' // default
}
