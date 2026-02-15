import { describe, it, expect, beforeEach } from 'vitest'
import { loadConversationsFromStorage } from './index'
import { localStorageMock } from './test-helpers'

describe('conversationStorage - corrupted JSON reset', () => {
  beforeEach(() => {
    localStorageMock.clear()
  })

  it('should handle corrupted JSON and reset storage', () => {
    const projectName = 'test-project'
    
    // Set invalid JSON in localStorage
    localStorage.setItem(`hal-chat-conversations-${projectName}`, 'invalid json{')
    
    const loadResult = loadConversationsFromStorage(projectName)
    
    expect(loadResult.success).toBe(false)
    expect(loadResult.wasReset).toBe(true)
    expect(loadResult.conversations).toBeDefined()
    expect(loadResult.conversations!.size).toBe(0)
    expect(loadResult.error).toContain('corrupted')
    expect(loadResult.error).toContain('reset')
    
    // Storage should be cleared
    expect(localStorage.getItem(`hal-chat-conversations-${projectName}`)).toBeNull()
  })

  it('should handle completely malformed JSON', () => {
    const projectName = 'test-project'
    
    localStorage.setItem(`hal-chat-conversations-${projectName}`, 'not json at all!!!')
    
    const loadResult = loadConversationsFromStorage(projectName)
    
    expect(loadResult.success).toBe(false)
    expect(loadResult.wasReset).toBe(true)
    expect(loadResult.conversations!.size).toBe(0)
    expect(loadResult.error).toContain('corrupted')
  })
})
