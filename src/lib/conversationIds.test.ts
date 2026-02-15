import { describe, it, expect } from 'vitest'
import {
  getConversationId,
  parseConversationId,
  getNextInstanceNumber,
} from './conversationIds'
import type { Agent, Conversation } from '../types/hal'

describe('conversationIds', () => {
  describe('getConversationId', () => {
    it('should generate conversation ID for project-manager', () => {
      expect(getConversationId('project-manager', 1)).toBe('project-manager-1')
    })

    it('should generate conversation ID for implementation-agent', () => {
      expect(getConversationId('implementation-agent', 1)).toBe('implementation-agent-1')
    })

    it('should generate conversation ID for qa-agent', () => {
      expect(getConversationId('qa-agent', 1)).toBe('qa-agent-1')
    })

    it('should generate conversation ID for process-review-agent', () => {
      expect(getConversationId('process-review-agent', 1)).toBe('process-review-agent-1')
    })

    it('should handle instance numbers greater than 1', () => {
      expect(getConversationId('project-manager', 2)).toBe('project-manager-2')
      expect(getConversationId('implementation-agent', 5)).toBe('implementation-agent-5')
    })
  })

  describe('parseConversationId', () => {
    it('should parse valid project-manager conversation ID', () => {
      const result = parseConversationId('project-manager-1')
      expect(result).toEqual({
        agentRole: 'project-manager',
        instanceNumber: 1,
      })
    })

    it('should parse valid implementation-agent conversation ID', () => {
      const result = parseConversationId('implementation-agent-2')
      expect(result).toEqual({
        agentRole: 'implementation-agent',
        instanceNumber: 2,
      })
    })

    it('should parse valid qa-agent conversation ID', () => {
      const result = parseConversationId('qa-agent-3')
      expect(result).toEqual({
        agentRole: 'qa-agent',
        instanceNumber: 3,
      })
    })

    it('should parse valid process-review-agent conversation ID', () => {
      const result = parseConversationId('process-review-agent-1')
      expect(result).toEqual({
        agentRole: 'process-review-agent',
        instanceNumber: 1,
      })
    })

    it('should return null for invalid conversation ID format', () => {
      expect(parseConversationId('invalid-id')).toBeNull()
      expect(parseConversationId('project-manager')).toBeNull()
      expect(parseConversationId('project-manager-')).toBeNull()
      expect(parseConversationId('-1')).toBeNull()
      expect(parseConversationId('')).toBeNull()
    })

    it('should return null for conversation ID with non-numeric instance', () => {
      expect(parseConversationId('project-manager-abc')).toBeNull()
      expect(parseConversationId('project-manager-1a')).toBeNull()
    })

    it('should return null for conversation ID with invalid agent role', () => {
      expect(parseConversationId('invalid-agent-1')).toBeNull()
      expect(parseConversationId('unknown-1')).toBeNull()
    })

    it('should handle large instance numbers', () => {
      const result = parseConversationId('project-manager-999')
      expect(result).toEqual({
        agentRole: 'project-manager',
        instanceNumber: 999,
      })
    })
  })

  describe('getNextInstanceNumber', () => {
    it('should return 1 when map is empty', () => {
      const conversations = new Map<string, Conversation>()
      expect(getNextInstanceNumber(conversations, 'project-manager')).toBe(1)
      expect(getNextInstanceNumber(conversations, 'implementation-agent')).toBe(1)
    })

    it('should return next number when there are existing conversations', () => {
      const conversations = new Map<string, Conversation>()
      conversations.set('project-manager-1', {
        id: 'project-manager-1',
        agentRole: 'project-manager',
        instanceNumber: 1,
        messages: [],
        createdAt: new Date(),
      })
      conversations.set('project-manager-2', {
        id: 'project-manager-2',
        agentRole: 'project-manager',
        instanceNumber: 2,
        messages: [],
        createdAt: new Date(),
      })

      expect(getNextInstanceNumber(conversations, 'project-manager')).toBe(3)
    })

    it('should handle gaps in instance numbers', () => {
      const conversations = new Map<string, Conversation>()
      conversations.set('project-manager-1', {
        id: 'project-manager-1',
        agentRole: 'project-manager',
        instanceNumber: 1,
        messages: [],
        createdAt: new Date(),
      })
      conversations.set('project-manager-3', {
        id: 'project-manager-3',
        agentRole: 'project-manager',
        instanceNumber: 3,
        messages: [],
        createdAt: new Date(),
      })
      // Gap: instance 2 is missing

      expect(getNextInstanceNumber(conversations, 'project-manager')).toBe(4)
    })

    it('should only consider conversations for the specified agent role', () => {
      const conversations = new Map<string, Conversation>()
      conversations.set('project-manager-1', {
        id: 'project-manager-1',
        agentRole: 'project-manager',
        instanceNumber: 1,
        messages: [],
        createdAt: new Date(),
      })
      conversations.set('project-manager-5', {
        id: 'project-manager-5',
        agentRole: 'project-manager',
        instanceNumber: 5,
        messages: [],
        createdAt: new Date(),
      })
      conversations.set('implementation-agent-10', {
        id: 'implementation-agent-10',
        agentRole: 'implementation-agent',
        instanceNumber: 10,
        messages: [],
        createdAt: new Date(),
      })

      // Should ignore implementation-agent conversations
      expect(getNextInstanceNumber(conversations, 'project-manager')).toBe(6)
      // Should ignore project-manager conversations
      expect(getNextInstanceNumber(conversations, 'implementation-agent')).toBe(11)
    })

    it('should return 1 for agent role with no conversations', () => {
      const conversations = new Map<string, Conversation>()
      conversations.set('project-manager-1', {
        id: 'project-manager-1',
        agentRole: 'project-manager',
        instanceNumber: 1,
        messages: [],
        createdAt: new Date(),
      })

      // qa-agent has no conversations
      expect(getNextInstanceNumber(conversations, 'qa-agent')).toBe(1)
    })

    it('should handle all agent roles correctly', () => {
      const conversations = new Map<string, Conversation>()
      conversations.set('project-manager-2', {
        id: 'project-manager-2',
        agentRole: 'project-manager',
        instanceNumber: 2,
        messages: [],
        createdAt: new Date(),
      })
      conversations.set('implementation-agent-1', {
        id: 'implementation-agent-1',
        agentRole: 'implementation-agent',
        instanceNumber: 1,
        messages: [],
        createdAt: new Date(),
      })
      conversations.set('qa-agent-3', {
        id: 'qa-agent-3',
        agentRole: 'qa-agent',
        instanceNumber: 3,
        messages: [],
        createdAt: new Date(),
      })
      conversations.set('process-review-agent-1', {
        id: 'process-review-agent-1',
        agentRole: 'process-review-agent',
        instanceNumber: 1,
        messages: [],
        createdAt: new Date(),
      })

      expect(getNextInstanceNumber(conversations, 'project-manager')).toBe(3)
      expect(getNextInstanceNumber(conversations, 'implementation-agent')).toBe(2)
      expect(getNextInstanceNumber(conversations, 'qa-agent')).toBe(4)
      expect(getNextInstanceNumber(conversations, 'process-review-agent')).toBe(2)
    })
  })
})
