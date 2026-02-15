import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  saveConversationsToStorage,
  loadConversationsFromStorage,
  type Conversation,
} from './index'
import { localStorageMock } from './test-helpers'

describe('conversationStorage - partial recovery behavior', () => {
  beforeEach(() => {
    localStorageMock.clear()
  })

  it('should recover valid conversations when some are corrupted', () => {
    const projectName = 'test-project'
    
    // Mix of valid and invalid conversations
    localStorage.setItem(
      `hal-chat-conversations-${projectName}`,
      JSON.stringify([
        {
          id: 'valid-1',
          agentRole: 'project-manager',
          instanceNumber: 1,
          createdAt: new Date().toISOString(),
          messages: [
            {
              id: 1,
              agent: 'user',
              content: 'Valid message',
              timestamp: new Date().toISOString(),
            },
          ],
        },
        {
          id: 'invalid-1',
          agentRole: 'invalid-agent',
          instanceNumber: 1,
          createdAt: new Date().toISOString(),
          messages: [],
        },
        {
          id: 'valid-2',
          agentRole: 'implementation-agent',
          instanceNumber: 1,
          createdAt: new Date().toISOString(),
          messages: [
            {
              id: 1,
              agent: 'user',
              content: 'Another valid message',
              timestamp: new Date().toISOString(),
            },
          ],
        },
      ])
    )
    
    const loadResult = loadConversationsFromStorage(projectName)
    
    // Should succeed with partial recovery
    expect(loadResult.success).toBe(true)
    expect(loadResult.conversations!.size).toBe(2)
    expect(loadResult.conversations!.has('valid-1')).toBe(true)
    expect(loadResult.conversations!.has('valid-2')).toBe(true)
    expect(loadResult.conversations!.has('invalid-1')).toBe(false)
    expect(loadResult.error).toContain('Some conversations were corrupted')
    expect(loadResult.error).toContain('2 conversation(s) were recovered')
    
    // Valid conversations should be saved back to storage
    const saved = localStorage.getItem(`hal-chat-conversations-${projectName}`)
    expect(saved).not.toBeNull()
    const parsed = JSON.parse(saved!)
    expect(parsed.length).toBe(2)
    expect(parsed.some((c: any) => c.id === 'valid-1')).toBe(true)
    expect(parsed.some((c: any) => c.id === 'valid-2')).toBe(true)
  })

  it('should handle empty storage gracefully', () => {
    const projectName = 'test-project'
    
    const loadResult = loadConversationsFromStorage(projectName)
    
    expect(loadResult.success).toBe(true)
    expect(loadResult.conversations!.size).toBe(0)
    expect(loadResult.error).toBeUndefined()
  })

  it('should handle save errors gracefully', () => {
    const projectName = 'test-project'
    const conversations = new Map<string, Conversation>()
    
    const conversation: Conversation = {
      id: 'test-1',
      agentRole: 'project-manager',
      instanceNumber: 1,
      messages: [],
      createdAt: new Date(),
    }
    
    conversations.set(conversation.id, conversation)
    
    // Mock localStorage.setItem to throw
    const originalSetItem = localStorage.setItem
    localStorage.setItem = vi.fn(() => {
      throw new Error('Storage quota exceeded')
    })
    
    const saveResult = saveConversationsToStorage(projectName, conversations)
    
    expect(saveResult.success).toBe(false)
    expect(saveResult.error).toContain('Failed to save')
    expect(saveResult.error).toContain('Storage quota exceeded')
    
    // Restore
    localStorage.setItem = originalSetItem
  })
})
