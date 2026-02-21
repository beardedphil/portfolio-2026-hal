/**
 * Chat UI helpers: labels, time formatting, theme, chat options.
 */
import type { ChatTarget, Message, Theme } from '../types/hal'
import { THEME_STORAGE_KEY } from '../constants'

export const CHAT_OPTIONS: { id: ChatTarget; label: string }[] = [
  { id: 'project-manager', label: 'Project Manager' },
  { id: 'implementation-agent', label: 'Implementation Agent' },
  { id: 'qa-agent', label: 'QA' },
  { id: 'process-review-agent', label: 'Process Review' },
]

export function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function getMessageAuthorLabel(agent: Message['agent']): string {
  if (agent === 'user') return 'You'
  if (agent === 'project-manager' || agent === 'implementation-agent' || agent === 'qa-agent' || agent === 'process-review-agent') return 'HAL'
  return 'System'
}

export function getInitialTheme(): Theme {
  // Always return 'dark' - theme dropdown removed (0797)
  return 'dark'
}

export { THEME_STORAGE_KEY }
