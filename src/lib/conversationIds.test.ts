import { describe, it, expect } from 'vitest'
import {
  getConversationId,
  parseConversationId,
  getNextInstanceNumber,
} from './conversationIds'
import type { Agent, Conversation } from './conversationStorage/types'

const createConversation = (id: string, agentRole: Agent, instanceNumber: number): Conversation => ({
  id,
  agentRole,
  instanceNumber,
  messages: [],
  createdAt: new Date(),
})

describe('conversationIds', () => {
  describe('getConversationId', () => {
    it('should generate correct IDs for all agent types', () => {
      expect(getConversationId('project-manager', 1)).toBe('project-manager-1')
      expect(getConversationId('implementation-agent', 1)).toBe('implementation-agent-1')
      expect(getConversationId('qa-agent', 1)).toBe('qa-agent-1')
      expect(getConversationId('process-review-agent', 1)).toBe('process-review-agent-1')
      expect(getConversationId('project-manager', 10)).toBe('project-manager-10')
    })

    it('should handle edge cases', () => {
      expect(getConversationId('project-manager', 0)).toBe('project-manager-0')
      expect(getConversationId('project-manager', 999)).toBe('project-manager-999')
    })
  })

  describe('parseConversationId', () => {
    it('should parse valid conversation IDs for all agent types', () => {
      expect(parseConversationId('project-manager-1')).toEqual({
        agentRole: 'project-manager',
        instanceNumber: 1,
      })
      expect(parseConversationId('implementation-agent-1')).toEqual({
        agentRole: 'implementation-agent',
        instanceNumber: 1,
      })
      expect(parseConversationId('qa-agent-1')).toEqual({
        agentRole: 'qa-agent',
        instanceNumber: 1,
      })
      expect(parseConversationId('process-review-agent-1')).toEqual({
        agentRole: 'process-review-agent',
        instanceNumber: 1,
      })
      expect(parseConversationId('project-manager-10')).toEqual({
        agentRole: 'project-manager',
        instanceNumber: 10,
      })
    })

    it('should return null for invalid conversation IDs', () => {
      const invalidIds = [
        'project-manager', // Missing instance number
        'project-manager-', // Missing instance number
        'invalid-agent-1', // Invalid agent role
        'project-manager_1', // Wrong format
        '', // Empty string
        'project-manager-abc', // Non-numeric
        'project-manager-1-extra', // Extra characters
      ]
      invalidIds.forEach(id => expect(parseConversationId(id)).toBeNull())
    })

    it('should handle edge cases', () => {
      expect(parseConversationId('project-manager-0')).toEqual({
        agentRole: 'project-manager',
        instanceNumber: 0,
      })
      expect(parseConversationId('project-manager-999')).toEqual({
        agentRole: 'project-manager',
        instanceNumber: 999,
      })
    })
  })

  describe('getNextInstanceNumber', () => {
    it('should return 1 for empty conversations map', () => {
      const conversations = new Map<string, Conversation>()
      const agents: Agent[] = ['project-manager', 'implementation-agent', 'qa-agent', 'process-review-agent']
      agents.forEach(agent => expect(getNextInstanceNumber(conversations, agent)).toBe(1))
    })

    it('should return next instance number correctly', () => {
      const conversations = new Map<string, Conversation>()
      conversations.set('project-manager-1', createConversation('project-manager-1', 'project-manager', 1))
      expect(getNextInstanceNumber(conversations, 'project-manager')).toBe(2)

      conversations.set('project-manager-3', createConversation('project-manager-3', 'project-manager', 3))
      expect(getNextInstanceNumber(conversations, 'project-manager')).toBe(4)
    })

    it('should ignore conversations from other agents', () => {
      const conversations = new Map<string, Conversation>()
      conversations.set('project-manager-1', createConversation('project-manager-1', 'project-manager', 1))
      conversations.set('implementation-agent-1', createConversation('implementation-agent-1', 'implementation-agent', 1))
      conversations.set('qa-agent-5', createConversation('qa-agent-5', 'qa-agent', 5))

      expect(getNextInstanceNumber(conversations, 'project-manager')).toBe(2)
      expect(getNextInstanceNumber(conversations, 'implementation-agent')).toBe(2)
      expect(getNextInstanceNumber(conversations, 'qa-agent')).toBe(6)
      expect(getNextInstanceNumber(conversations, 'process-review-agent')).toBe(1)
    })

    it('should handle gaps in instance numbers', () => {
      const conversations = new Map<string, Conversation>()
      conversations.set('project-manager-1', createConversation('project-manager-1', 'project-manager', 1))
      conversations.set('project-manager-5', createConversation('project-manager-5', 'project-manager', 5))
      expect(getNextInstanceNumber(conversations, 'project-manager')).toBe(6)
    })
  })

  describe('round-trip consistency', () => {
    it('should generate IDs that can be parsed back correctly', () => {
      const agentRoles: Agent[] = ['project-manager', 'implementation-agent', 'qa-agent', 'process-review-agent']
      for (const agentRole of agentRoles) {
        for (let instanceNumber = 1; instanceNumber <= 5; instanceNumber++) {
          const id = getConversationId(agentRole, instanceNumber)
          const parsed = parseConversationId(id)
          expect(parsed).not.toBeNull()
          expect(parsed?.agentRole).toBe(agentRole)
          expect(parsed?.instanceNumber).toBe(instanceNumber)
        }
      }
    })
  })
})
