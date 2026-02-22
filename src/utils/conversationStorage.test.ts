import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getStorageKey,
  getConversationId,
  parseConversationId,
  getNextInstanceNumber,
  getEmptyConversations,
  saveConversationsToStorage,
  loadConversationsFromStorage,
} from './conversationStorage'
import type { Conversation, Message } from '../types/hal'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    }),
  }
})()

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
})

describe('getStorageKey', () => {
  it('should return storage key with prefix', () => {
    const key = getStorageKey('test-project')
    expect(key).toContain('test-project')
  })
})

describe('getConversationId', () => {
  it('should generate conversation ID for project-manager', () => {
    expect(getConversationId('project-manager', 1)).toBe('project-manager-1')
    expect(getConversationId('project-manager', 5)).toBe('project-manager-5')
  })

  it('should generate conversation ID for implementation-agent', () => {
    expect(getConversationId('implementation-agent', 2)).toBe('implementation-agent-2')
  })

  it('should generate conversation ID for qa-agent', () => {
    expect(getConversationId('qa-agent', 3)).toBe('qa-agent-3')
  })

  it('should generate conversation ID for process-review-agent', () => {
    expect(getConversationId('process-review-agent', 4)).toBe('process-review-agent-4')
  })
})

describe('parseConversationId', () => {
  it('should parse valid conversation IDs', () => {
    expect(parseConversationId('project-manager-1')).toEqual({
      agentRole: 'project-manager',
      instanceNumber: 1,
    })
    expect(parseConversationId('implementation-agent-5')).toEqual({
      agentRole: 'implementation-agent',
      instanceNumber: 5,
    })
    expect(parseConversationId('qa-agent-10')).toEqual({
      agentRole: 'qa-agent',
      instanceNumber: 10,
    })
    expect(parseConversationId('process-review-agent-2')).toEqual({
      agentRole: 'process-review-agent',
      instanceNumber: 2,
    })
  })

  it('should return null for invalid conversation IDs', () => {
    expect(parseConversationId('invalid')).toBeNull()
    expect(parseConversationId('project-manager')).toBeNull()
    expect(parseConversationId('project-manager-abc')).toBeNull()
    expect(parseConversationId('unknown-agent-1')).toBeNull()
    expect(parseConversationId('')).toBeNull()
  })
})

describe('getNextInstanceNumber', () => {
  it('should return 1 for empty conversations', () => {
    const conversations = new Map<string, Conversation>()
    expect(getNextInstanceNumber(conversations, 'project-manager')).toBe(1)
  })

  it('should return next number based on existing conversations', () => {
    const conversations = new Map<string, Conversation>()
    conversations.set('id1', {
      id: 'id1',
      agentRole: 'project-manager',
      instanceNumber: 1,
      createdAt: new Date(),
      messages: [],
    })
    conversations.set('id2', {
      id: 'id2',
      agentRole: 'project-manager',
      instanceNumber: 3,
      createdAt: new Date(),
      messages: [],
    })
    expect(getNextInstanceNumber(conversations, 'project-manager')).toBe(4)
  })

  it('should only consider conversations with matching agent role', () => {
    const conversations = new Map<string, Conversation>()
    conversations.set('id1', {
      id: 'id1',
      agentRole: 'project-manager',
      instanceNumber: 5,
      createdAt: new Date(),
      messages: [],
    })
    conversations.set('id2', {
      id: 'id2',
      agentRole: 'qa-agent',
      instanceNumber: 10,
      createdAt: new Date(),
      messages: [],
    })
    expect(getNextInstanceNumber(conversations, 'qa-agent')).toBe(11)
    expect(getNextInstanceNumber(conversations, 'project-manager')).toBe(6)
  })
})

describe('getEmptyConversations', () => {
  it('should return an empty Map', () => {
    const result = getEmptyConversations()
    expect(result).toBeInstanceOf(Map)
    expect(result.size).toBe(0)
  })
})

describe('saveConversationsToStorage', () => {
  beforeEach(() => {
    localStorageMock.clear()
  })

  it('should save conversations to localStorage', () => {
    const conversations = new Map<string, Conversation>()
    const message: Message = {
      id: 'msg1',
      agent: 'user',
      content: 'Hello',
      timestamp: new Date('2024-01-15T10:00:00Z'),
    }
    conversations.set('conv1', {
      id: 'conv1',
      agentRole: 'project-manager',
      instanceNumber: 1,
      createdAt: new Date('2024-01-15T10:00:00Z'),
      messages: [message],
    })

    const result = saveConversationsToStorage('test-project', conversations)
    expect(result.success).toBe(true)
    expect(localStorageMock.setItem).toHaveBeenCalled()
  })

  it('should handle localStorage errors gracefully', () => {
    localStorageMock.setItem.mockImplementationOnce(() => {
      throw new Error('Storage quota exceeded')
    })

    const conversations = new Map<string, Conversation>()
    const result = saveConversationsToStorage('test-project', conversations)
    expect(result.success).toBe(false)
    expect(result.error).toContain('Failed to save conversations')
  })
})

describe('loadConversationsFromStorage', () => {
  beforeEach(() => {
    localStorageMock.clear()
  })

  it('should return empty map when no data is stored', () => {
    const result = loadConversationsFromStorage('test-project')
    expect(result.success).toBe(true)
    expect(result.conversations).toBeInstanceOf(Map)
    expect(result.conversations?.size).toBe(0)
  })

  it('should load conversations from localStorage', () => {
    const serialized = [
      {
        id: 'conv1',
        agentRole: 'project-manager',
        instanceNumber: 1,
        createdAt: '2024-01-15T10:00:00.000Z',
        messages: [
          {
            id: 'msg1',
            agent: 'user',
            content: 'Hello',
            timestamp: '2024-01-15T10:00:00.000Z',
          },
        ],
      },
    ]
    localStorageMock.getItem.mockReturnValue(JSON.stringify(serialized))

    const result = loadConversationsFromStorage('test-project')
    expect(result.success).toBe(true)
    expect(result.conversations?.size).toBe(1)
    const conv = result.conversations?.get('conv1')
    expect(conv?.id).toBe('conv1')
    expect(conv?.agentRole).toBe('project-manager')
    expect(conv?.messages).toHaveLength(1)
  })

  it('should handle invalid JSON gracefully', () => {
    localStorageMock.getItem.mockReturnValue('invalid json')

    const result = loadConversationsFromStorage('test-project')
    expect(result.success).toBe(false)
    expect(result.error).toContain('Failed to load conversations')
  })

  it('should handle localStorage errors gracefully', () => {
    localStorageMock.getItem.mockImplementationOnce(() => {
      throw new Error('Storage error')
    })

    const result = loadConversationsFromStorage('test-project')
    expect(result.success).toBe(false)
    expect(result.error).toContain('Failed to load conversations')
  })
})
