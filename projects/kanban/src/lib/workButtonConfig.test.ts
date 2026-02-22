import { describe, it, expect } from 'vitest'
import { shouldShowWorkButton, getWorkButtonConfig, isProcessReviewConfig } from './workButtonConfig'
import type { Column, Card } from './columnTypes'

describe('shouldShowWorkButton', () => {
  it('returns true for unassigned column', () => {
    expect(shouldShowWorkButton('col-unassigned')).toBe(true)
  })

  it('returns true for todo column', () => {
    expect(shouldShowWorkButton('col-todo')).toBe(true)
  })

  it('returns true for qa column', () => {
    expect(shouldShowWorkButton('col-qa')).toBe(true)
  })

  it('returns true for process-review column', () => {
    expect(shouldShowWorkButton('col-process-review')).toBe(true)
  })

  it('returns false for other columns', () => {
    expect(shouldShowWorkButton('col-doing')).toBe(false)
    expect(shouldShowWorkButton('col-done')).toBe(false)
    expect(shouldShowWorkButton('col-human-in-the-loop')).toBe(false)
  })
})

describe('getWorkButtonConfig', () => {
  it('returns null for columns without work button', () => {
    const col: Column = { id: 'col-doing', title: 'Doing', position: 0 }
    expect(getWorkButtonConfig(col, null)).toBeNull()
  })

  it('returns config for unassigned column', () => {
    const col: Column = { id: 'col-unassigned', title: 'Unassigned', position: 0 }
    const config = getWorkButtonConfig(col, null)
    expect(config).not.toBeNull()
    if (config && 'chatTarget' in config) {
      expect(config.chatTarget).toBe('project-manager')
      expect(config.label).toContain('Prepare')
    }
  })

  it('returns config for todo column', () => {
    const col: Column = { id: 'col-todo', title: 'To-do', position: 0 }
    const config = getWorkButtonConfig(col, null)
    expect(config).not.toBeNull()
    if (config && 'chatTarget' in config) {
      expect(config.chatTarget).toBe('implementation-agent')
      expect(config.label).toContain('Implement')
    }
  })

  it('returns config for qa column', () => {
    const col: Column = { id: 'col-qa', title: 'Ready for QA', position: 0 }
    const config = getWorkButtonConfig(col, null)
    expect(config).not.toBeNull()
    if (config && 'chatTarget' in config) {
      expect(config.chatTarget).toBe('qa-agent')
      expect(config.label).toContain('QA')
    }
  })

  it('returns process review config for process-review column', () => {
    const col: Column = { id: 'col-process-review', title: 'Process Review', position: 0 }
    const config = getWorkButtonConfig(col, null)
    expect(config).not.toBeNull()
    if (config) {
      expect('isProcessReview' in config).toBe(true)
    }
  })

  it('includes ticket reference in message', () => {
    const col: Column = { id: 'col-todo', title: 'To-do', position: 0 }
    const card: Card = { id: 'ticket-123', displayId: 'HAL-0123' } as Card
    const config = getWorkButtonConfig(col, card)
    if (config && 'message' in config) {
      expect(config.message).toContain('HAL-0123')
    }
  })
})

describe('isProcessReviewConfig', () => {
  it('returns true for process review config', () => {
    const config = { label: 'Review', isProcessReview: true }
    expect(isProcessReviewConfig(config)).toBe(true)
  })

  it('returns false for regular config', () => {
    const config = { label: 'Implement', chatTarget: 'implementation-agent', message: 'Test' }
    expect(isProcessReviewConfig(config)).toBe(false)
  })

  it('returns false for null', () => {
    expect(isProcessReviewConfig(null)).toBe(false)
  })
})
