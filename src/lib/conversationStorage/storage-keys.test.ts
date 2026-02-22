import { describe, it, expect } from 'vitest'
import { getStorageKey } from './storage-keys.js'

describe('getStorageKey', () => {
  it('generates storage key with prefix', () => {
    const key = getStorageKey('test-project')
    expect(key).toBe('hal-chat-conversations-test-project')
  })

  it('handles different project names', () => {
    expect(getStorageKey('project1')).toBe('hal-chat-conversations-project1')
    expect(getStorageKey('project2')).toBe('hal-chat-conversations-project2')
  })

  it('handles project names with special characters', () => {
    const key = getStorageKey('my-project-2024')
    expect(key).toBe('hal-chat-conversations-my-project-2024')
  })

  it('handles empty project name', () => {
    const key = getStorageKey('')
    expect(key).toBe('hal-chat-conversations-')
  })
})
