import { vi } from 'vitest'

// Mock fetch globally
global.fetch = vi.fn()

// Mock getSupabaseClient
vi.mock('./lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => ({
              data: { content_md: '---\ndescription: Test\n---\n\nContent' },
              error: null,
            })),
            order: vi.fn(() => ({
              data: [],
              error: null,
            })),
          })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            data: null,
            error: null,
          })),
        })),
      })),
    })),
  })),
}))

export const mockInstructionsResponse = {
  success: true,
  instructions: [
    {
      filename: 'test-instruction.mdc',
      title: 'Test Instruction',
      description: 'A test instruction',
      alwaysApply: false,
      contentBody: 'Test content',
      contentMd: '---\ndescription: A test instruction\n---\n\nTest content',
      agentTypes: ['implementation-agent'],
      topicId: 'test-instruction',
      isBasic: true,
      isSituational: false,
      topicMetadata: {
        title: 'Test Instruction',
        description: 'A test instruction',
        agentTypes: ['implementation-agent'],
      },
    },
  ],
}

export const mockIndexResponse = {
  success: true,
  index: {
    basic: ['test-instruction'],
    situational: {},
    topics: {
      'test-instruction': {
        title: 'Test Instruction',
        description: 'A test instruction',
        agentTypes: ['implementation-agent'],
      },
    },
  },
}

export const mockOnClose = vi.fn()
