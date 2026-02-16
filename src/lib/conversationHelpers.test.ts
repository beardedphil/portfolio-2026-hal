import { describe, it, expect } from 'vitest'
import {
  getConversationId,
  parseConversationId,
  getNextInstanceNumber,
  formatTime,
  getMessageAuthorLabel,
} from './conversationHelpers'
import type { Agent, Conversation } from './conversationStorage'

describe('conversationHelpers', () => {
  describe('getConversationId', () => {
    it('should generate correct ID for project-manager', () => {
      expect(getConversationId('project-manager', 1)).toBe('project-manager-1')
      expect(getConversationId('project-manager', 2)).toBe('project-manager-2')
      expect(getConversationId('project-manager', 10)).toBe('project-manager-10')
    })

    it('should generate correct ID for implementation-agent', () => {
      expect(getConversationId('implementation-agent', 1)).toBe('implementation-agent-1')
      expect(getConversationId('implementation-agent', 3)).toBe('implementation-agent-3')
    })

    it('should generate correct ID for qa-agent', () => {
      expect(getConversationId('qa-agent', 1)).toBe('qa-agent-1')
      expect(getConversationId('qa-agent', 5)).toBe('qa-agent-5')
    })

    it('should generate correct ID for process-review-agent', () => {
      expect(getConversationId('process-review-agent', 1)).toBe('process-review-agent-1')
      expect(getConversationId('process-review-agent', 2)).toBe('process-review-agent-2')
    })

    it('should handle instance number 0', () => {
      expect(getConversationId('project-manager', 0)).toBe('project-manager-0')
    })

    it('should handle large instance numbers', () => {
      expect(getConversationId('implementation-agent', 999)).toBe('implementation-agent-999')
    })
  })

  describe('parseConversationId', () => {
    it('should parse valid project-manager IDs', () => {
      expect(parseConversationId('project-manager-1')).toEqual({
        agentRole: 'project-manager',
        instanceNumber: 1,
      })
      expect(parseConversationId('project-manager-2')).toEqual({
        agentRole: 'project-manager',
        instanceNumber: 2,
      })
    })

    it('should parse valid implementation-agent IDs', () => {
      expect(parseConversationId('implementation-agent-1')).toEqual({
        agentRole: 'implementation-agent',
        instanceNumber: 1,
      })
      expect(parseConversationId('implementation-agent-3')).toEqual({
        agentRole: 'implementation-agent',
        instanceNumber: 3,
      })
    })

    it('should parse valid qa-agent IDs', () => {
      expect(parseConversationId('qa-agent-1')).toEqual({
        agentRole: 'qa-agent',
        instanceNumber: 1,
      })
      expect(parseConversationId('qa-agent-5')).toEqual({
        agentRole: 'qa-agent',
        instanceNumber: 5,
      })
    })

    it('should parse valid process-review-agent IDs', () => {
      expect(parseConversationId('process-review-agent-1')).toEqual({
        agentRole: 'process-review-agent',
        instanceNumber: 1,
      })
      expect(parseConversationId('process-review-agent-2')).toEqual({
        agentRole: 'process-review-agent',
        instanceNumber: 2,
      })
    })

    it('should return null for invalid format - missing dash', () => {
      expect(parseConversationId('project-manager1')).toBeNull()
      expect(parseConversationId('implementationagent-1')).toBeNull()
    })

    it('should return null for invalid format - wrong prefix', () => {
      expect(parseConversationId('invalid-agent-1')).toBeNull()
      expect(parseConversationId('unknown-1')).toBeNull()
    })

    it('should return null for invalid format - non-numeric instance', () => {
      expect(parseConversationId('project-manager-abc')).toBeNull()
      expect(parseConversationId('implementation-agent-1a')).toBeNull()
    })

    it('should return null for invalid format - empty string', () => {
      expect(parseConversationId('')).toBeNull()
    })

    it('should return null for invalid format - just agent name', () => {
      expect(parseConversationId('project-manager')).toBeNull()
      expect(parseConversationId('implementation-agent')).toBeNull()
    })

    it('should return null for invalid format - extra characters', () => {
      expect(parseConversationId('project-manager-1-extra')).toBeNull()
      expect(parseConversationId('implementation-agent-1-suffix')).toBeNull()
    })

    it('should handle large instance numbers', () => {
      expect(parseConversationId('project-manager-999')).toEqual({
        agentRole: 'project-manager',
        instanceNumber: 999,
      })
    })

    it('should handle instance number 0', () => {
      expect(parseConversationId('project-manager-0')).toEqual({
        agentRole: 'project-manager',
        instanceNumber: 0,
      })
    })
  })

  describe('getNextInstanceNumber', () => {
    it('should return 1 for empty conversations map', () => {
      const conversations = new Map<string, Conversation>()
      expect(getNextInstanceNumber(conversations, 'project-manager')).toBe(1)
      expect(getNextInstanceNumber(conversations, 'implementation-agent')).toBe(1)
      expect(getNextInstanceNumber(conversations, 'qa-agent')).toBe(1)
    })

    it('should return next number when conversations exist for the role', () => {
      const conversations = new Map<string, Conversation>()
      conversations.set('project-manager-1', {
        id: 'project-manager-1',
        agentRole: 'project-manager',
        instanceNumber: 1,
        messages: [],
        createdAt: new Date(),
      })
      expect(getNextInstanceNumber(conversations, 'project-manager')).toBe(2)
    })

    it('should return next number for highest instance', () => {
      const conversations = new Map<string, Conversation>()
      conversations.set('implementation-agent-1', {
        id: 'implementation-agent-1',
        agentRole: 'implementation-agent',
        instanceNumber: 1,
        messages: [],
        createdAt: new Date(),
      })
      conversations.set('implementation-agent-3', {
        id: 'implementation-agent-3',
        agentRole: 'implementation-agent',
        instanceNumber: 3,
        messages: [],
        createdAt: new Date(),
      })
      expect(getNextInstanceNumber(conversations, 'implementation-agent')).toBe(4)
    })

    it('should ignore conversations for different agent roles', () => {
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
      conversations.set('qa-agent-2', {
        id: 'qa-agent-2',
        agentRole: 'qa-agent',
        instanceNumber: 2,
        messages: [],
        createdAt: new Date(),
      })
      expect(getNextInstanceNumber(conversations, 'qa-agent')).toBe(3)
      expect(getNextInstanceNumber(conversations, 'project-manager')).toBe(6)
    })

    it('should handle multiple instances correctly', () => {
      const conversations = new Map<string, Conversation>()
      for (let i = 1; i <= 5; i++) {
        conversations.set(`implementation-agent-${i}`, {
          id: `implementation-agent-${i}`,
          agentRole: 'implementation-agent',
          instanceNumber: i,
          messages: [],
          createdAt: new Date(),
        })
      }
      expect(getNextInstanceNumber(conversations, 'implementation-agent')).toBe(6)
    })

    it('should handle gaps in instance numbers', () => {
      const conversations = new Map<string, Conversation>()
      conversations.set('qa-agent-1', {
        id: 'qa-agent-1',
        agentRole: 'qa-agent',
        instanceNumber: 1,
        messages: [],
        createdAt: new Date(),
      })
      conversations.set('qa-agent-5', {
        id: 'qa-agent-5',
        agentRole: 'qa-agent',
        instanceNumber: 5,
        messages: [],
        createdAt: new Date(),
      })
      // Should return 6 (next after highest), not 2 (filling gap)
      expect(getNextInstanceNumber(conversations, 'qa-agent')).toBe(6)
    })
  })

  describe('formatTime', () => {
    it('should format time in 24-hour format', () => {
      const date = new Date('2024-01-15T14:30:45')
      const formatted = formatTime(date)
      expect(formatted).toMatch(/^\d{2}:\d{2}:\d{2}$/)
      expect(formatted).toBe('14:30:45')
    })

    it('should zero-pad hours, minutes, and seconds', () => {
      const date = new Date('2024-01-15T09:05:03')
      expect(formatTime(date)).toBe('09:05:03')
    })

    it('should handle midnight', () => {
      const date = new Date('2024-01-15T00:00:00')
      expect(formatTime(date)).toBe('00:00:00')
    })

    it('should handle end of day', () => {
      const date = new Date('2024-01-15T23:59:59')
      expect(formatTime(date)).toBe('23:59:59')
    })

    it('should handle noon', () => {
      const date = new Date('2024-01-15T12:00:00')
      expect(formatTime(date)).toBe('12:00:00')
    })

    it('should format different times correctly', () => {
      expect(formatTime(new Date('2024-01-15T01:23:45'))).toBe('01:23:45')
      expect(formatTime(new Date('2024-01-15T15:45:30'))).toBe('15:45:30')
    })
  })

  describe('getMessageAuthorLabel', () => {
    it('should return "You" for user messages', () => {
      expect(getMessageAuthorLabel('user')).toBe('You')
    })

    it('should return "HAL" for project-manager', () => {
      expect(getMessageAuthorLabel('project-manager')).toBe('HAL')
    })

    it('should return "HAL" for implementation-agent', () => {
      expect(getMessageAuthorLabel('implementation-agent')).toBe('HAL')
    })

    it('should return "HAL" for qa-agent', () => {
      expect(getMessageAuthorLabel('qa-agent')).toBe('HAL')
    })

    it('should return "HAL" for process-review-agent', () => {
      expect(getMessageAuthorLabel('process-review-agent')).toBe('HAL')
    })

    it('should return "System" for system messages', () => {
      expect(getMessageAuthorLabel('system')).toBe('System')
    })
  })
})
