import { describe, it, expect, beforeEach } from 'vitest'
import {
  saveConversationsToStorage,
  loadConversationsFromStorage,
  type Conversation,
  type Message,
} from './index'
import { localStorageMock } from './test-helpers'

describe('conversationStorage - round-trip', () => {
  beforeEach(() => {
    localStorageMock.clear()
  })

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
