import { describe, it, expect } from 'vitest'
import {
  getConversationId,
  parseConversationId,
  getNextInstanceNumber,
  formatTime,
  getMessageAuthorLabel,
} from './conversation-helpers'
import type { Agent, Conversation } from './conversationStorage'

describe('conversation-helpers', () => {
  describe('getConversationId', () => {
    it('should generate ID for project-manager', () => {
      expect(getConversationId('project-manager', 1)).toBe('project-manager-1')
      expect(getConversationId('project-manager', 5)).toBe('project-manager-5')
    })

    it('should generate ID for implementation-agent', () => {
      expect(getConversationId('implementation-agent', 1)).toBe('implementation-agent-1')
      expect(getConversationId('implementation-agent', 10)).toBe('implementation-agent-10')
    })

    it('should generate ID for qa-agent', () => {
      expect(getConversationId('qa-agent', 1)).toBe('qa-agent-1')
      expect(getConversationId('qa-agent', 3)).toBe('qa-agent-3')
    })

    it('should generate ID for process-review-agent', () => {
      expect(getConversationId('process-review-agent', 1)).toBe('process-review-agent-1')
      expect(getConversationId('process-review-agent', 2)).toBe('process-review-agent-2')
    })

    it('should handle instance number 0', () => {
      expect(getConversationId('implementation-agent', 0)).toBe('implementation-agent-0')
    })

    it('should handle large instance numbers', () => {
      expect(getConversationId('implementation-agent', 999)).toBe('implementation-agent-999')
    })
  })

  describe('parseConversationId', () => {
    it('should parse valid project-manager ID', () => {
      const result = parseConversationId('project-manager-1')
      expect(result).toEqual({ agentRole: 'project-manager', instanceNumber: 1 })
    })

    it('should parse valid implementation-agent ID', () => {
      const result = parseConversationId('implementation-agent-2')
      expect(result).toEqual({ agentRole: 'implementation-agent', instanceNumber: 2 })
    })

    it('should parse valid qa-agent ID', () => {
      const result = parseConversationId('qa-agent-3')
      expect(result).toEqual({ agentRole: 'qa-agent', instanceNumber: 3 })
    })

    it('should parse valid process-review-agent ID', () => {
      const result = parseConversationId('process-review-agent-1')
      expect(result).toEqual({ agentRole: 'process-review-agent', instanceNumber: 1 })
    })

    it('should parse IDs with multi-digit instance numbers', () => {
      expect(parseConversationId('implementation-agent-10')).toEqual({
        agentRole: 'implementation-agent',
        instanceNumber: 10,
      })
      expect(parseConversationId('qa-agent-99')).toEqual({
        agentRole: 'qa-agent',
        instanceNumber: 99,
      })
    })

    it('should return null for invalid format - missing instance number', () => {
      expect(parseConversationId('implementation-agent')).toBeNull()
      expect(parseConversationId('project-manager-')).toBeNull()
    })

    it('should return null for invalid format - invalid agent role', () => {
      expect(parseConversationId('invalid-agent-1')).toBeNull()
      expect(parseConversationId('user-1')).toBeNull()
      expect(parseConversationId('system-1')).toBeNull()
    })

    it('should return null for invalid format - non-numeric instance', () => {
      expect(parseConversationId('implementation-agent-abc')).toBeNull()
      expect(parseConversationId('qa-agent-1a')).toBeNull()
    })

    it('should return null for invalid format - extra characters', () => {
      expect(parseConversationId('implementation-agent-1-extra')).toBeNull()
      expect(parseConversationId('prefix-implementation-agent-1')).toBeNull()
    })

    it('should return null for empty string', () => {
      expect(parseConversationId('')).toBeNull()
    })

    it('should return null for malformed ID', () => {
      expect(parseConversationId('implementation agent 1')).toBeNull()
      expect(parseConversationId('implementation_agent_1')).toBeNull()
    })

    it('should handle instance number 0', () => {
      const result = parseConversationId('implementation-agent-0')
      expect(result).toEqual({ agentRole: 'implementation-agent', instanceNumber: 0 })
    })
  })

  describe('getNextInstanceNumber', () => {
    it('should return 1 for empty conversations map', () => {
      const conversations = new Map<string, Conversation>()
      expect(getNextInstanceNumber(conversations, 'implementation-agent')).toBe(1)
    })

    it('should return 1 when no conversations exist for agent role', () => {
      const conversations = new Map<string, Conversation>([
        [
          'project-manager-1',
          {
            id: 'project-manager-1',
            agentRole: 'project-manager',
            instanceNumber: 1,
            messages: [],
            createdAt: new Date(),
          },
        ],
      ])
      expect(getNextInstanceNumber(conversations, 'implementation-agent')).toBe(1)
    })

    it('should return next number when conversations exist', () => {
      const conversations = new Map<string, Conversation>([
        [
          'implementation-agent-1',
          {
            id: 'implementation-agent-1',
            agentRole: 'implementation-agent',
            instanceNumber: 1,
            messages: [],
            createdAt: new Date(),
          },
        ],
      ])
      expect(getNextInstanceNumber(conversations, 'implementation-agent')).toBe(2)
    })

    it('should find max instance number across multiple conversations', () => {
      const conversations = new Map<string, Conversation>([
        [
          'implementation-agent-1',
          {
            id: 'implementation-agent-1',
            agentRole: 'implementation-agent',
            instanceNumber: 1,
            messages: [],
            createdAt: new Date(),
          },
        ],
        [
          'implementation-agent-3',
          {
            id: 'implementation-agent-3',
            agentRole: 'implementation-agent',
            instanceNumber: 3,
            messages: [],
            createdAt: new Date(),
          },
        ],
        [
          'implementation-agent-2',
          {
            id: 'implementation-agent-2',
            agentRole: 'implementation-agent',
            instanceNumber: 2,
            messages: [],
            createdAt: new Date(),
          },
        ],
      ])
      expect(getNextInstanceNumber(conversations, 'implementation-agent')).toBe(4)
    })

    it('should ignore conversations from other agent roles', () => {
      const conversations = new Map<string, Conversation>([
        [
          'project-manager-1',
          {
            id: 'project-manager-1',
            agentRole: 'project-manager',
            instanceNumber: 1,
            messages: [],
            createdAt: new Date(),
          },
        ],
        [
          'qa-agent-5',
          {
            id: 'qa-agent-5',
            agentRole: 'qa-agent',
            instanceNumber: 5,
            messages: [],
            createdAt: new Date(),
          },
        ],
      ])
      expect(getNextInstanceNumber(conversations, 'implementation-agent')).toBe(1)
    })

    it('should handle multiple instances of same agent role', () => {
      const conversations = new Map<string, Conversation>([
        [
          'qa-agent-1',
          {
            id: 'qa-agent-1',
            agentRole: 'qa-agent',
            instanceNumber: 1,
            messages: [],
            createdAt: new Date(),
          },
        ],
        [
          'qa-agent-10',
          {
            id: 'qa-agent-10',
            agentRole: 'qa-agent',
            instanceNumber: 10,
            messages: [],
            createdAt: new Date(),
          },
        ],
        [
          'qa-agent-5',
          {
            id: 'qa-agent-5',
            agentRole: 'qa-agent',
            instanceNumber: 5,
            messages: [],
            createdAt: new Date(),
          },
        ],
      ])
      expect(getNextInstanceNumber(conversations, 'qa-agent')).toBe(11)
    })
  })

  describe('formatTime', () => {
    it('should format date with 2-digit hours, minutes, seconds', () => {
      const date = new Date('2024-01-15T14:30:45')
      const formatted = formatTime(date)
      expect(formatted).toBe('14:30:45')
    })

    it('should format midnight correctly', () => {
      const date = new Date('2024-01-15T00:00:00')
      const formatted = formatTime(date)
      expect(formatted).toBe('00:00:00')
    })

    it('should format noon correctly', () => {
      const date = new Date('2024-01-15T12:00:00')
      const formatted = formatTime(date)
      expect(formatted).toBe('12:00:00')
    })

    it('should format single-digit hours with leading zero', () => {
      const date = new Date('2024-01-15T09:05:03')
      const formatted = formatTime(date)
      expect(formatted).toBe('09:05:03')
    })

    it('should format single-digit minutes with leading zero', () => {
      const date = new Date('2024-01-15T14:05:45')
      const formatted = formatTime(date)
      expect(formatted).toBe('14:05:45')
    })

    it('should format single-digit seconds with leading zero', () => {
      const date = new Date('2024-01-15T14:30:05')
      const formatted = formatTime(date)
      expect(formatted).toBe('14:30:05')
    })

    it('should format end of day correctly', () => {
      const date = new Date('2024-01-15T23:59:59')
      const formatted = formatTime(date)
      expect(formatted).toBe('23:59:59')
    })

    it('should use 24-hour format (no AM/PM)', () => {
      const date = new Date('2024-01-15T15:30:45') // 3:30:45 PM
      const formatted = formatTime(date)
      expect(formatted).toBe('15:30:45')
      expect(formatted).not.toContain('PM')
      expect(formatted).not.toContain('AM')
    })

    it('should handle different dates but same time', () => {
      const date1 = new Date('2024-01-15T14:30:45')
      const date2 = new Date('2024-12-31T14:30:45')
      expect(formatTime(date1)).toBe(formatTime(date2))
    })
  })

  describe('getMessageAuthorLabel', () => {
    it('should return "You" for user agent', () => {
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

    it('should return "System" for system agent', () => {
      expect(getMessageAuthorLabel('system')).toBe('System')
    })

    it('should handle all agent types correctly', () => {
      expect(getMessageAuthorLabel('user')).toBe('You')
      expect(getMessageAuthorLabel('project-manager')).toBe('HAL')
      expect(getMessageAuthorLabel('implementation-agent')).toBe('HAL')
      expect(getMessageAuthorLabel('qa-agent')).toBe('HAL')
      expect(getMessageAuthorLabel('process-review-agent')).toBe('HAL')
      expect(getMessageAuthorLabel('system')).toBe('System')
    })
  })
})
