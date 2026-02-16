/**
 * Utility functions extracted from App.tsx
 */

export function formatTime(): string {
  const d = new Date()
  return d.toLocaleTimeString('en-US', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0')
}

export function normalizeTitle(title: string): string {
  return title.trim().toLowerCase()
}
