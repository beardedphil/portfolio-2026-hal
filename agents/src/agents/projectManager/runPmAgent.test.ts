import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runPmAgent, type PmAgentResult } from '../projectManager.js'
import type { PmAgentConfig } from './contextBuilding.js'

// Mock dependencies
vi.mock('../projectManager/contextBuilding.js', async () => {
  const actual = await vi.importActual('../projectManager/contextBuilding.js')
  return {
    ...actual,
    buildContextPack: vi.fn().mockResolvedValue('Mock context pack'),
  }
})

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => ({
    responses: vi.fn(() => ({
      streamText: vi.fn(),
    })),
  })),
}))

vi.mock('ai', async () => {
  const actual = await vi.importActual('ai')
  return {
    ...actual,
    streamText: vi.fn(),
  }
})

describe('runPmAgent', () => {
  const mockConfig: PmAgentConfig & {
    onTextDelta?: (delta: string) => void | Promise<void>
    onProgress?: (message: string) => void | Promise<void>
    abortSignal?: AbortSignal
  } = {
    repoRoot: '/test/repo',
    openaiApiKey: 'test-key',
    openaiModel: 'gpt-4',
    projectId: 'test/project',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Mock fetch globally
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
      text: async () => '{}',
      headers: new Headers(),
    })
  })

  it('should return error result when context pack building fails', async () => {
    const { buildContextPack } = await import('../projectManager/contextBuilding.js')
    vi.mocked(buildContextPack).mockRejectedValueOnce(new Error('Context build failed'))

    const result = await runPmAgent('test message', mockConfig)

    expect(result.error).toBe('Context build failed')
    expect(result.errorPhase).toBe('context-pack')
    expect(result.reply).toBe('')
    expect(result.toolCalls).toEqual([])
  })

  it('should handle abort signal correctly', async () => {
    const abortController = new AbortController()
    abortController.abort()

    const configWithAbort = {
      ...mockConfig,
      abortSignal: abortController.signal,
    }

    // Mock streamText to throw AbortError
    const { streamText } = await import('ai')
    vi.mocked(streamText).mockRejectedValueOnce(new Error('Aborted'))

    await expect(runPmAgent('test message', configWithAbort)).rejects.toThrow()
  })

  it('should capture and return tool calls', async () => {
    const mockToolCall = {
      name: 'test_tool',
      input: { test: 'input' },
      output: { success: true },
    }

    // Mock streamText to return a result with tool calls
    const { streamText } = await import('ai')
    const mockTextStream = async function* () {
      yield 'Test response'
    }
    
    vi.mocked(streamText).mockResolvedValueOnce({
      textStream: mockTextStream(),
      providerMetadata: {},
    } as any)

    const result = await runPmAgent('test message', mockConfig)

    expect(result).toHaveProperty('reply')
    expect(result).toHaveProperty('toolCalls')
    expect(Array.isArray(result.toolCalls)).toBe(true)
  })

  it('should handle HAL API fetch errors gracefully', async () => {
    // Mock fetch to return error
    global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'))

    const { buildContextPack } = await import('../projectManager/contextBuilding.js')
    vi.mocked(buildContextPack).mockResolvedValueOnce('Context pack')

    const { streamText } = await import('ai')
    const mockTextStream = async function* () {
      yield 'Response'
    }
    
    vi.mocked(streamText).mockResolvedValueOnce({
      textStream: mockTextStream(),
      providerMetadata: {},
    } as any)

    const result = await runPmAgent('test message', mockConfig)

    // Should still return a result even if some API calls fail
    expect(result).toHaveProperty('reply')
  })

  it('should include promptText in result when provided', async () => {
    const { buildContextPack } = await import('../projectManager/contextBuilding.js')
    vi.mocked(buildContextPack).mockResolvedValueOnce('Context pack')

    const { streamText } = await import('ai')
    const mockTextStream = async function* () {
      yield 'Response'
    }
    
    vi.mocked(streamText).mockResolvedValueOnce({
      textStream: mockTextStream(),
      providerMetadata: {},
    } as any)

    const result = await runPmAgent('test message', mockConfig)

    expect(result).toHaveProperty('promptText')
    expect(typeof result.promptText).toBe('string')
  })

  it('should handle images in config for vision models', async () => {
    const configWithImages = {
      ...mockConfig,
      images: [
        {
          filename: 'test.png',
          mimeType: 'image/png',
          dataUrl: 'data:image/png;base64,test',
        },
      ],
      openaiModel: 'gpt-4o',
    }

    const { buildContextPack } = await import('../projectManager/contextBuilding.js')
    vi.mocked(buildContextPack).mockResolvedValueOnce('Context pack')

    const { streamText } = await import('ai')
    const mockTextStream = async function* () {
      yield 'Response'
    }
    
    vi.mocked(streamText).mockResolvedValueOnce({
      textStream: mockTextStream(),
      providerMetadata: {},
    } as any)

    const result = await runPmAgent('test message', configWithImages)

    expect(result).toHaveProperty('promptText')
    expect(result.promptText).toContain('Images')
  })
})
