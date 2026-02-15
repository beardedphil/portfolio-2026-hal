import { describe, it, expect, beforeEach } from 'vitest'
import { loadConversationsFromStorage } from './index'
import { localStorageMock } from './test-helpers'

describe('conversationStorage - invalid structure handling', () => {
  beforeEach(() => {
    localStorageMock.clear()
  })

  it('should handle non-array data', () => {
    const projectName = 'test-project'
    
    // Set non-array JSON
    localStorage.setItem(`hal-chat-conversations-${projectName}`, JSON.stringify({ not: 'an array' }))
    
    const loadResult = loadConversationsFromStorage(projectName)
    
    expect(loadResult.success).toBe(false)
    expect(loadResult.wasReset).toBe(true)
    expect(loadResult.conversations!.size).toBe(0)
    expect(loadResult.error).toContain('corrupted')
    
    // Storage should be cleared
    expect(localStorage.getItem(`hal-chat-conversations-${projectName}`)).toBeNull()
  })

  it('should handle conversations with missing required fields', () => {
    const projectName = 'test-project'
    
    // Set array with invalid conversation structure
    localStorage.setItem(
      `hal-chat-conversations-${projectName}`,
      JSON.stringify([{ id: 'test', missingFields: true }])
    )
    
    const loadResult = loadConversationsFromStorage(projectName)
    
    // All conversations invalid, so should reset
    expect(loadResult.success).toBe(false)
    expect(loadResult.wasReset).toBe(true)
    expect(loadResult.conversations!.size).toBe(0)
    expect(loadResult.error).toContain('corrupted')
  })

  it('should handle conversations with invalid agentRole', () => {
    const projectName = 'test-project'
    
    localStorage.setItem(
      `hal-chat-conversations-${projectName}`,
      JSON.stringify([
        {
          id: 'test-1',
          agentRole: 'invalid-agent',
          instanceNumber: 1,
          createdAt: new Date().toISOString(),
          messages: [],
        },
      ])
    )
    
    const loadResult = loadConversationsFromStorage(projectName)
    
    expect(loadResult.success).toBe(false)
    expect(loadResult.wasReset).toBe(true)
    expect(loadResult.conversations!.size).toBe(0)
  })

  it('should handle conversations with invalid date strings', () => {
    const projectName = 'test-project'
    
    localStorage.setItem(
      `hal-chat-conversations-${projectName}`,
      JSON.stringify([
        {
          id: 'test-1',
          agentRole: 'project-manager',
          instanceNumber: 1,
          createdAt: 'invalid-date',
          messages: [],
        },
      ])
    )
    
    const loadResult = loadConversationsFromStorage(projectName)
    
    expect(loadResult.success).toBe(false)
    expect(loadResult.wasReset).toBe(true)
    expect(loadResult.conversations!.size).toBe(0)
  })

  it('should handle messages with invalid timestamps', () => {
    const projectName = 'test-project'
    
    localStorage.setItem(
      `hal-chat-conversations-${projectName}`,
      JSON.stringify([
        {
          id: 'test-1',
          agentRole: 'project-manager',
          instanceNumber: 1,
          createdAt: new Date().toISOString(),
          messages: [
            {
              id: 1,
              agent: 'user',
              content: 'Valid message',
              timestamp: 'invalid-timestamp',
            },
          ],
        },
      ])
    )
    
    const loadResult = loadConversationsFromStorage(projectName)
    
    // Conversation should load but message with invalid timestamp should be skipped
    expect(loadResult.success).toBe(true)
    expect(loadResult.conversations!.size).toBe(1)
    const conv = loadResult.conversations!.get('test-1')!
    expect(conv.messages.length).toBe(0) // Invalid message skipped
  })
})
