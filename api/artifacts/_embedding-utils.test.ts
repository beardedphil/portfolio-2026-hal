import { describe, it, expect, vi, beforeEach } from 'vitest'
import { computeChunkHash, chunkTextIfNeeded, extractDistilledAtomChunks } from './_embedding-utils.js'
import * as distillModule from '../context-bundles/_distill.js'

vi.mock('../context-bundles/_distill.js', () => ({
  distillArtifact: vi.fn(),
}))

describe('computeChunkHash', () => {
  it('should compute a stable hash for a text chunk', () => {
    const text = 'Hello World'
    const hash1 = computeChunkHash(text)
    const hash2 = computeChunkHash(text)
    expect(hash1).toBe(hash2)
    expect(hash1).toMatch(/^[a-f0-9]{64}$/) // SHA-256 hex string
  })

  it('should normalize text by trimming and lowercasing', () => {
    const hash1 = computeChunkHash('  Hello World  ')
    const hash2 = computeChunkHash('hello world')
    expect(hash1).toBe(hash2)
  })

  it('should produce different hashes for different text', () => {
    const hash1 = computeChunkHash('Hello World')
    const hash2 = computeChunkHash('Goodbye World')
    expect(hash1).not.toBe(hash2)
  })

  it('should handle empty strings', () => {
    const hash = computeChunkHash('')
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })
})

describe('chunkTextIfNeeded', () => {
  it('should return single chunk if text is within max size', () => {
    const text = 'Short text'
    const chunks = chunkTextIfNeeded(text, 1000)
    expect(chunks).toEqual([text])
  })

  it('should split text on sentence boundaries when exceeding max size', () => {
    const text = 'First sentence. Second sentence. Third sentence.'
    const chunks = chunkTextIfNeeded(text, 20)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.join(' ')).toContain('First sentence')
    expect(chunks.join(' ')).toContain('Second sentence')
  })

  it('should split long sentences by words', () => {
    const longSentence = 'This is a very long sentence that exceeds the maximum chunk size limit and needs to be split into multiple word chunks.'
    const chunks = chunkTextIfNeeded(longSentence, 30)
    expect(chunks.length).toBeGreaterThan(1)
    chunks.forEach(chunk => {
      expect(chunk.length).toBeLessThanOrEqual(30)
    })
  })

  it('should handle text with no sentence boundaries', () => {
    const text = 'No periods or exclamation marks or question marks here just words'
    const chunks = chunkTextIfNeeded(text, 20)
    expect(chunks.length).toBeGreaterThan(1)
    chunks.forEach(chunk => {
      expect(chunk.length).toBeLessThanOrEqual(20)
    })
  })

  it('should filter out empty chunks', () => {
    const text = 'Text with   multiple   spaces'
    const chunks = chunkTextIfNeeded(text, 5)
    expect(chunks.every(chunk => chunk.length > 0)).toBe(true)
  })

  it('should use default maxChunkSize of 1000', () => {
    const text = 'Short text'
    const chunks1 = chunkTextIfNeeded(text)
    const chunks2 = chunkTextIfNeeded(text, 1000)
    expect(chunks1).toEqual(chunks2)
  })
})

describe('extractDistilledAtomChunks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should extract summary as a chunk', async () => {
    const mockDistilled = {
      summary: 'This is a summary',
      hard_facts: [],
      keywords: [],
    }
    vi.mocked(distillModule.distillArtifact).mockResolvedValue({
      success: true,
      distilled: mockDistilled,
    })

    const result = await extractDistilledAtomChunks('Some artifact body', 'Test Title')
    expect(result.success).toBe(true)
    expect(result.chunks).toHaveLength(1)
    expect(result.chunks![0].atomType).toBe('summary')
    expect(result.chunks![0].text).toBe('This is a summary')
    expect(result.chunks![0].chunkIndex).toBe(0)
    expect(result.chunks![0].chunkHash).toBe(computeChunkHash('This is a summary'))
  })

  it('should extract hard facts as separate chunks', async () => {
    const mockDistilled = {
      summary: 'Summary',
      hard_facts: ['Fact 1', 'Fact 2', 'Fact 3'],
      keywords: [],
    }
    vi.mocked(distillModule.distillArtifact).mockResolvedValue({
      success: true,
      distilled: mockDistilled,
    })

    const result = await extractDistilledAtomChunks('Some artifact body')
    expect(result.success).toBe(true)
    expect(result.chunks).toHaveLength(4) // 1 summary + 3 facts
    expect(result.chunks![0].atomType).toBe('summary')
    expect(result.chunks![1].atomType).toBe('hard_fact')
    expect(result.chunks![1].text).toBe('Fact 1')
    expect(result.chunks![2].atomType).toBe('hard_fact')
    expect(result.chunks![2].text).toBe('Fact 2')
    expect(result.chunks![3].atomType).toBe('hard_fact')
    expect(result.chunks![3].text).toBe('Fact 3')
  })

  it('should extract keywords as separate chunks', async () => {
    const mockDistilled = {
      summary: 'Summary',
      hard_facts: [],
      keywords: ['keyword1', 'keyword2'],
    }
    vi.mocked(distillModule.distillArtifact).mockResolvedValue({
      success: true,
      distilled: mockDistilled,
    })

    const result = await extractDistilledAtomChunks('Some artifact body')
    expect(result.success).toBe(true)
    expect(result.chunks).toHaveLength(3) // 1 summary + 2 keywords
    expect(result.chunks![1].atomType).toBe('keyword')
    expect(result.chunks![1].text).toBe('keyword1')
    expect(result.chunks![2].atomType).toBe('keyword')
    expect(result.chunks![2].text).toBe('keyword2')
  })

  it('should skip empty or whitespace-only atoms', async () => {
    const mockDistilled = {
      summary: 'Summary',
      hard_facts: ['Valid fact', '', '   ', null, undefined],
      keywords: ['valid keyword', ''],
    }
    vi.mocked(distillModule.distillArtifact).mockResolvedValue({
      success: true,
      distilled: mockDistilled,
    })

    const result = await extractDistilledAtomChunks('Some artifact body')
    expect(result.success).toBe(true)
    // Should only have summary + 1 valid fact + 1 valid keyword
    expect(result.chunks).toHaveLength(3)
    expect(result.chunks!.every(chunk => chunk.text.trim().length > 0)).toBe(true)
  })

  it('should handle missing summary', async () => {
    const mockDistilled = {
      summary: '',
      hard_facts: ['Fact 1'],
      keywords: [],
    }
    vi.mocked(distillModule.distillArtifact).mockResolvedValue({
      success: true,
      distilled: mockDistilled,
    })

    const result = await extractDistilledAtomChunks('Some artifact body')
    expect(result.success).toBe(true)
    expect(result.chunks).toHaveLength(1)
    expect(result.chunks![0].atomType).toBe('hard_fact')
  })

  it('should return error if distillation fails', async () => {
    vi.mocked(distillModule.distillArtifact).mockResolvedValue({
      success: false,
      error: 'Distillation failed',
    })

    const result = await extractDistilledAtomChunks('Some artifact body')
    expect(result.success).toBe(false)
    expect(result.error).toBe('Distillation failed')
    expect(result.chunks).toBeUndefined()
  })

  it('should return error if distilled is missing', async () => {
    vi.mocked(distillModule.distillArtifact).mockResolvedValue({
      success: true,
      distilled: undefined,
    })

    const result = await extractDistilledAtomChunks('Some artifact body')
    expect(result.success).toBe(false)
    expect(result.error).toBe('Failed to distill artifact')
  })

  it('should pass artifact title to distillArtifact', async () => {
    const mockDistilled = {
      summary: 'Summary',
      hard_facts: [],
      keywords: [],
    }
    vi.mocked(distillModule.distillArtifact).mockResolvedValue({
      success: true,
      distilled: mockDistilled,
    })

    await extractDistilledAtomChunks('Body', 'Test Title')
    expect(distillModule.distillArtifact).toHaveBeenCalledWith('Body', 'Test Title')
  })

  it('should handle non-array hard_facts', async () => {
    const mockDistilled = {
      summary: 'Summary',
      hard_facts: null,
      keywords: [],
    }
    vi.mocked(distillModule.distillArtifact).mockResolvedValue({
      success: true,
      distilled: mockDistilled,
    })

    const result = await extractDistilledAtomChunks('Some artifact body')
    expect(result.success).toBe(true)
    expect(result.chunks).toHaveLength(1) // Only summary
  })

  it('should handle non-array keywords', async () => {
    const mockDistilled = {
      summary: 'Summary',
      hard_facts: [],
      keywords: null,
    }
    vi.mocked(distillModule.distillArtifact).mockResolvedValue({
      success: true,
      distilled: mockDistilled,
    })

    const result = await extractDistilledAtomChunks('Some artifact body')
    expect(result.success).toBe(true)
    expect(result.chunks).toHaveLength(1) // Only summary
  })
})
