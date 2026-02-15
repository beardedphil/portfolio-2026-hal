export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'hal-theme'

export function getInitialTheme(): Theme {
  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') {
    return stored
  }
  return 'light' // default
}
