import { describe, it, expect } from 'vitest'
import { formatTime, getMessageAuthorLabel, getInitialTheme, CHAT_OPTIONS } from './chatUtils'

describe('formatTime', () => {
  it('should format date as HH:MM:SS', () => {
    const date = new Date('2024-01-15T14:30:45')
    const formatted = formatTime(date)
    expect(formatted).toBe('14:30:45')
  })

  it('should format midnight correctly', () => {
    const date = new Date('2024-01-15T00:00:00')
    const formatted = formatTime(date)
    expect(formatted).toBe('00:00:00')
  })

  it('should format end of day correctly', () => {
    const date = new Date('2024-01-15T23:59:59')
    const formatted = formatTime(date)
    expect(formatted).toBe('23:59:59')
  })

  it('should pad single digit hours, minutes, and seconds', () => {
    const date = new Date('2024-01-15T09:05:03')
    const formatted = formatTime(date)
    expect(formatted).toBe('09:05:03')
  })
})

describe('getMessageAuthorLabel', () => {
  it('should return "You" for user agent', () => {
    expect(getMessageAuthorLabel('user')).toBe('You')
  })

  it('should return "HAL" for project-manager agent', () => {
    expect(getMessageAuthorLabel('project-manager')).toBe('HAL')
  })

  it('should return "HAL" for implementation-agent', () => {
    expect(getMessageAuthorLabel('implementation-agent')).toBe('HAL')
  })

  it('should return "HAL" for qa-agent', () => {
    expect(getMessageAuthorLabel('qa-agent')).toBe('HAL')
  })

  it('should return "HAL" for process-review-agent', () => {
    expect(getMessageAuthorLabel('process-review-agent')).toBe('HAL')
  })

  it('should return "System" for unknown agent types', () => {
    expect(getMessageAuthorLabel('unknown' as any)).toBe('System')
  })
})

describe('getInitialTheme', () => {
  it('should always return dark theme', () => {
    expect(getInitialTheme()).toBe('dark')
  })
})

describe('CHAT_OPTIONS', () => {
  it('should contain all expected chat targets', () => {
    const ids = CHAT_OPTIONS.map(opt => opt.id)
    expect(ids).toContain('project-manager')
    expect(ids).toContain('implementation-agent')
    expect(ids).toContain('qa-agent')
    expect(ids).toContain('process-review-agent')
  })

  it('should have labels for all options', () => {
    CHAT_OPTIONS.forEach(opt => {
      expect(opt.label).toBeTruthy()
      expect(typeof opt.label).toBe('string')
    })
  })
})
