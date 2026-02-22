import { describe, it, expect } from 'vitest'
import { validateSerializedConversation } from './validation.js'
import type { SerializedConversation } from './types'

describe('validateSerializedConversation', () => {
  it('returns true for valid conversation', () => {
    const valid: SerializedConversation = {
      id: 'test-id',
      agentRole: 'implementation-agent',
      instanceNumber: 1,
      createdAt: '2024-01-01T00:00:00Z',
      messages: [
        {
          id: 1,
          agent: 'user',
          content: 'Test message',
          timestamp: '2024-01-01T00:00:00Z',
        },
      ],
      oldestLoadedSequence: null,
      hasMoreMessages: false,
    }
    expect(validateSerializedConversation(valid)).toBe(true)
  })

  it('returns false for null', () => {
    expect(validateSerializedConversation(null)).toBe(false)
  })

  it('returns false for non-object', () => {
    expect(validateSerializedConversation('string')).toBe(false)
    expect(validateSerializedConversation(123)).toBe(false)
    expect(validateSerializedConversation([])).toBe(false)
  })

  it('returns false for missing id', () => {
    const invalid = {
      agentRole: 'implementation-agent',
      instanceNumber: 1,
      createdAt: '2024-01-01T00:00:00Z',
      messages: [],
    }
    expect(validateSerializedConversation(invalid)).toBe(false)
  })

  it('returns false for empty id', () => {
    const invalid: Partial<SerializedConversation> = {
      id: '',
      agentRole: 'implementation-agent',
      instanceNumber: 1,
      createdAt: '2024-01-01T00:00:00Z',
      messages: [],
    }
    expect(validateSerializedConversation(invalid)).toBe(false)
  })

  it('returns false for invalid agentRole', () => {
    const invalid: Partial<SerializedConversation> = {
      id: 'test-id',
      agentRole: 'invalid-agent',
      instanceNumber: 1,
      createdAt: '2024-01-01T00:00:00Z',
      messages: [],
    }
    expect(validateSerializedConversation(invalid)).toBe(false)
  })

  it('returns true for all valid agent roles', () => {
    const validAgents = ['project-manager', 'implementation-agent', 'qa-agent', 'process-review-agent']
    for (const agent of validAgents) {
      const conv: SerializedConversation = {
        id: 'test-id',
        agentRole: agent as any,
        instanceNumber: 1,
        createdAt: '2024-01-01T00:00:00Z',
        messages: [],
        oldestLoadedSequence: null,
        hasMoreMessages: false,
      }
      expect(validateSerializedConversation(conv)).toBe(true)
    }
  })

  it('returns false for missing messages array', () => {
    const invalid: Partial<SerializedConversation> = {
      id: 'test-id',
      agentRole: 'implementation-agent',
      instanceNumber: 1,
      createdAt: '2024-01-01T00:00:00Z',
    }
    expect(validateSerializedConversation(invalid)).toBe(false)
  })

  it('validates message structure', () => {
    const invalid: Partial<SerializedConversation> = {
      id: 'test-id',
      agentRole: 'implementation-agent',
      instanceNumber: 1,
      createdAt: '2024-01-01T00:00:00Z',
      messages: [
        {
          // Missing required fields
        } as any,
      ],
    }
    expect(validateSerializedConversation(invalid)).toBe(false)
  })

  it('returns true for empty messages array', () => {
    const valid: SerializedConversation = {
      id: 'test-id',
      agentRole: 'implementation-agent',
      instanceNumber: 1,
      createdAt: '2024-01-01T00:00:00Z',
      messages: [],
      oldestLoadedSequence: null,
      hasMoreMessages: false,
    }
    expect(validateSerializedConversation(valid)).toBe(true)
  })
})
