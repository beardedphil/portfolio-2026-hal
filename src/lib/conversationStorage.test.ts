import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  saveConversationsToStorage,
  loadConversationsFromStorage,
  type Agent,
  type Conversation,
  type Message,
} from './conversationStorage/index'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
  }
})()

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
})

describe('conversationStorage', () => {
  beforeEach(() => {
    localStorageMock.clear()
  })

  describe('save round-trip', () => {
    it('should save and load conversations successfully', () => {
      const projectName = 'test-project'
      const conversations = new Map<string, Conversation>()
      
      const message1: Message = {
        id: 1,
        agent: 'user',
        content: 'Hello',
        timestamp: new Date('2026-01-01T10:00:00Z'),
      }
      
      const message2: Message = {
        id: 2,
        agent: 'project-manager',
        content: 'Hi there',
        timestamp: new Date('2026-01-01T10:01:00Z'),
        promptText: 'Full prompt text',
      }
      
      const conversation: Conversation = {
        id: 'project-manager-1',
        agentRole: 'project-manager',
        instanceNumber: 1,
        messages: [message1, message2],
        createdAt: new Date('2026-01-01T09:00:00Z'),
      }
      
      conversations.set(conversation.id, conversation)
      
      // Save
      const saveResult = saveConversationsToStorage(projectName, conversations)
      expect(saveResult.success).toBe(true)
      expect(saveResult.error).toBeUndefined()
      
      // Load
      const loadResult = loadConversationsFromStorage(projectName)
      expect(loadResult.success).toBe(true)
      expect(loadResult.conversations).toBeDefined()
      expect(loadResult.error).toBeUndefined()
      
      const loaded = loadResult.conversations!
      expect(loaded.size).toBe(1)
      expect(loaded.has('project-manager-1')).toBe(true)
      
      const loadedConv = loaded.get('project-manager-1')!
      expect(loadedConv.id).toBe('project-manager-1')
      expect(loadedConv.agentRole).toBe('project-manager')
      expect(loadedConv.instanceNumber).toBe(1)
      expect(loadedConv.messages.length).toBe(2)
      expect(loadedConv.messages[0].content).toBe('Hello')
      expect(loadedConv.messages[1].content).toBe('Hi there')
      expect(loadedConv.messages[1].promptText).toBe('Full prompt text')
      expect(loadedConv.createdAt).toBeInstanceOf(Date)
      expect(loadedConv.messages[0].timestamp).toBeInstanceOf(Date)
    })

    it('should handle image attachments in messages', () => {
      const projectName = 'test-project'
      const conversations = new Map<string, Conversation>()
      
      const message: Message = {
        id: 1,
        agent: 'user',
        content: 'Check this out',
        timestamp: new Date('2026-01-01T10:00:00Z'),
        imageAttachments: [
          {
            file: new File([''], 'test.png'),
            dataUrl: 'data:image/png;base64,test',
            filename: 'test.png',
          },
        ],
      }
      
      const conversation: Conversation = {
        id: 'implementation-agent-1',
        agentRole: 'implementation-agent',
        instanceNumber: 1,
        messages: [message],
        createdAt: new Date('2026-01-01T09:00:00Z'),
      }
      
      conversations.set(conversation.id, conversation)
      
      const saveResult = saveConversationsToStorage(projectName, conversations)
      expect(saveResult.success).toBe(true)
      
      const loadResult = loadConversationsFromStorage(projectName)
      expect(loadResult.success).toBe(true)
      
      // Note: File objects can't be restored from localStorage, so imageAttachments won't be present
      // But the serialization should succeed
      const loadedConv = loadResult.conversations!.get('implementation-agent-1')!
      expect(loadedConv.messages[0].content).toBe('Check this out')
    })

    it('should handle multiple conversations', () => {
      const projectName = 'test-project'
      const conversations = new Map<string, Conversation>()
      
      const conv1: Conversation = {
        id: 'project-manager-1',
        agentRole: 'project-manager',
        instanceNumber: 1,
        messages: [{ id: 1, agent: 'user', content: 'Msg 1', timestamp: new Date() }],
        createdAt: new Date(),
      }
      
      const conv2: Conversation = {
        id: 'implementation-agent-1',
        agentRole: 'implementation-agent',
        instanceNumber: 1,
        messages: [{ id: 1, agent: 'user', content: 'Msg 2', timestamp: new Date() }],
        createdAt: new Date(),
      }
      
      conversations.set(conv1.id, conv1)
      conversations.set(conv2.id, conv2)
      
      const saveResult = saveConversationsToStorage(projectName, conversations)
      expect(saveResult.success).toBe(true)
      
      const loadResult = loadConversationsFromStorage(projectName)
      expect(loadResult.success).toBe(true)
      expect(loadResult.conversations!.size).toBe(2)
      expect(loadResult.conversations!.has('project-manager-1')).toBe(true)
      expect(loadResult.conversations!.has('implementation-agent-1')).toBe(true)
    })
  })

  describe('corrupted JSON reset', () => {
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

  describe('invalid structure handling', () => {
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

  describe('partial recovery behavior', () => {
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
})
