import { describe, it, expect, beforeEach } from 'vitest'
import {
  saveConversationsToStorage,
  loadConversationsFromStorage,
  type Conversation,
  type Message,
} from './index'
import { localStorageMock } from './test-helpers'

describe('conversationStorage - images', () => {
  beforeEach(() => {
    localStorageMock.clear()
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
})
