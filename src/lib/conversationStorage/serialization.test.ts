import { describe, it, expect } from 'vitest'
import { serializeConversation, deserializeConversation } from './serialization.js'
import type { Conversation, SerializedConversation } from './types'

describe('serializeConversation', () => {
  it('serializes conversation with messages', () => {
    const conversation: Conversation = {
      id: 'test-id',
      agentRole: 'implementation-agent',
      instanceNumber: 1,
      createdAt: new Date('2024-01-01T00:00:00Z'),
      messages: [
        {
          id: 1,
          agent: 'user',
          content: 'Test message',
          timestamp: new Date('2024-01-01T00:00:00Z'),
        },
      ],
      oldestLoadedSequence: null,
      hasMoreMessages: false,
    }
    const serialized = serializeConversation(conversation)
    expect(serialized.id).toBe('test-id')
    expect(serialized.createdAt).toBe('2024-01-01T00:00:00.000Z')
    expect(serialized.messages).toHaveLength(1)
    expect(serialized.messages[0].timestamp).toBe('2024-01-01T00:00:00.000Z')
  })

  it('converts Date objects to ISO strings', () => {
    const conversation: Conversation = {
      id: 'test-id',
      agentRole: 'implementation-agent',
      instanceNumber: 1,
      createdAt: new Date('2024-01-01T00:00:00Z'),
      messages: [],
      oldestLoadedSequence: null,
      hasMoreMessages: false,
    }
    const serialized = serializeConversation(conversation)
    expect(typeof serialized.createdAt).toBe('string')
    expect(serialized.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('preserves all conversation fields', () => {
    const conversation: Conversation = {
      id: 'test-id',
      agentRole: 'qa-agent',
      instanceNumber: 2,
      createdAt: new Date('2024-01-01T00:00:00Z'),
      messages: [],
      oldestLoadedSequence: 10,
      hasMoreMessages: true,
    }
    const serialized = serializeConversation(conversation)
    expect(serialized.agentRole).toBe('qa-agent')
    expect(serialized.instanceNumber).toBe(2)
    expect(serialized.oldestLoadedSequence).toBe(10)
    expect(serialized.hasMoreMessages).toBe(true)
  })
})

describe('deserializeConversation', () => {
  it('deserializes valid conversation', () => {
    const serialized: SerializedConversation = {
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
    const conversation = deserializeConversation(serialized)
    expect(conversation).not.toBeNull()
    if (conversation) {
      expect(conversation.id).toBe('test-id')
      expect(conversation.createdAt).toBeInstanceOf(Date)
      expect(conversation.messages).toHaveLength(1)
      expect(conversation.messages[0].timestamp).toBeInstanceOf(Date)
    }
  })

  it('returns null for invalid date string', () => {
    const serialized: SerializedConversation = {
      id: 'test-id',
      agentRole: 'implementation-agent',
      instanceNumber: 1,
      createdAt: 'invalid-date',
      messages: [],
      oldestLoadedSequence: null,
      hasMoreMessages: false,
    }
    const conversation = deserializeConversation(serialized)
    expect(conversation).toBeNull()
  })

  it('skips messages with invalid timestamps', () => {
    const serialized: SerializedConversation = {
      id: 'test-id',
      agentRole: 'implementation-agent',
      instanceNumber: 1,
      createdAt: '2024-01-01T00:00:00Z',
      messages: [
        {
          id: 1,
          agent: 'user',
          content: 'Invalid timestamp',
          timestamp: 'invalid-date',
        },
        {
          id: 2,
          agent: 'user',
          content: 'Valid message',
          timestamp: '2024-01-01T00:00:00Z',
        },
      ],
      oldestLoadedSequence: null,
      hasMoreMessages: false,
    }
    const conversation = deserializeConversation(serialized)
    expect(conversation).not.toBeNull()
    if (conversation) {
      // Invalid timestamp message is skipped
      expect(conversation.messages).toHaveLength(1)
      expect(conversation.messages[0].content).toBe('Valid message')
    }
  })

  it('preserves all conversation fields', () => {
    const serialized: SerializedConversation = {
      id: 'test-id',
      agentRole: 'qa-agent',
      instanceNumber: 2,
      createdAt: '2024-01-01T00:00:00Z',
      messages: [],
      oldestLoadedSequence: 10,
      hasMoreMessages: true,
    }
    const conversation = deserializeConversation(serialized)
    expect(conversation).not.toBeNull()
    if (conversation) {
      expect(conversation.agentRole).toBe('qa-agent')
      expect(conversation.instanceNumber).toBe(2)
      expect(conversation.oldestLoadedSequence).toBe(10)
      expect(conversation.hasMoreMessages).toBe(true)
    }
  })

  it('handles messages without image attachments', () => {
    const serialized: SerializedConversation = {
      id: 'test-id',
      agentRole: 'implementation-agent',
      instanceNumber: 1,
      createdAt: '2024-01-01T00:00:00Z',
      messages: [
        {
          id: 1,
          agent: 'user',
          content: 'Test',
          timestamp: '2024-01-01T00:00:00Z',
        },
      ],
      oldestLoadedSequence: null,
      hasMoreMessages: false,
    }
    const conversation = deserializeConversation(serialized)
    expect(conversation).not.toBeNull()
    if (conversation) {
      expect(conversation.messages[0].content).toBe('Test')
      // Note: imageAttachments are not restored from localStorage (File objects can't be serialized)
    }
  })
})
