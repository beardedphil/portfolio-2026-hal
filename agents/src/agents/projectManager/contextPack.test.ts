import { describe, it, expect } from 'vitest'
import { buildContextPack } from './contextPack.js'
import type { PmAgentConfig, ConversationTurn } from './contextPack.js'
import { buildContextPack as buildContextPackOriginal } from './contextBuilding.js'

describe('contextPack', () => {
  describe('buildContextPack export', () => {
    it('exports buildContextPack as a function', () => {
      expect(typeof buildContextPack).toBe('function')
    })

    it('exports the same function reference as contextBuilding', () => {
      // The re-export should point to the same function
      expect(buildContextPack).toBe(buildContextPackOriginal)
    })

    it('buildContextPack has the correct function signature (2 parameters)', () => {
      // Verify the exported function has the expected signature
      expect(buildContextPack.length).toBe(2) // Two parameters: config and userMessage
    })
  })

  describe('type exports', () => {
    it('exports PmAgentConfig type', () => {
      // Type check: should be able to create a valid config
      const config: PmAgentConfig = {
        repoRoot: '/test/repo',
        openaiApiKey: 'test-key',
        openaiModel: 'gpt-4',
      }
      expect(config).toBeDefined()
      expect(config.repoRoot).toBe('/test/repo')
    })

    it('exports ConversationTurn type', () => {
      // Type check: should be able to create valid conversation turns
      const turns: ConversationTurn[] = [
        { role: 'user', content: 'Test message' },
        { role: 'assistant', content: 'Test response' },
      ]
      expect(turns).toBeDefined()
      expect(turns.length).toBe(2)
      expect(turns[0].role).toBe('user')
      expect(turns[1].role).toBe('assistant')
    })
  })

  describe('backward compatibility', () => {
    it('maintains same function signature as original buildContextPack', () => {
      // Verify the exported function has the expected signature
      expect(buildContextPack.length).toBe(2) // Two parameters: config and userMessage
    })

    it('function can be called with valid PmAgentConfig', () => {
      const config: PmAgentConfig = {
        repoRoot: '/test/repo',
        openaiApiKey: 'test-key',
        openaiModel: 'gpt-4',
      }
      const userMessage = 'Test message'

      // Should not throw when called (even if it fails internally due to missing files)
      // We're just testing that the function signature is correct
      expect(() => {
        // We expect this to potentially throw due to file system operations,
        // but the function should be callable with correct types
        buildContextPack(config, userMessage).catch(() => {
          // Expected to fail in test environment
        })
      }).not.toThrow()
    })
  })

  describe('behavior equivalence', () => {
    it('buildContextPack and original function are identical', () => {
      // The re-export should be the exact same function reference
      expect(buildContextPack).toBe(buildContextPackOriginal)
    })

    it('function accepts all PmAgentConfig optional fields', () => {
      const fullConfig: PmAgentConfig = {
        repoRoot: '/test/repo',
        openaiApiKey: 'test-key',
        openaiModel: 'gpt-4',
        rulesDir: '.cursor/rules',
        conversationHistory: [
          { role: 'user', content: 'Previous message' },
        ],
        conversationContextPack: 'Pre-built context',
        workingMemoryText: 'Working memory content',
        previousResponseId: 'response-123',
        projectId: 'test-project',
        repoFullName: 'owner/repo',
        images: [
          {
            dataUrl: 'data:image/png;base64,test',
            filename: 'test.png',
            mimeType: 'image/png',
          },
        ],
      }

      // Type check: should compile without errors
      expect(fullConfig).toBeDefined()
      expect(fullConfig.conversationHistory).toBeDefined()
      expect(fullConfig.workingMemoryText).toBeDefined()
    })
  })
})
