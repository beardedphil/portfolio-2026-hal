/**
 * Tests for GitHub API file functions.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { listDirectoryContents, fetchFileContents } from './index'
import { setupTestEnv } from './test-helpers'

beforeEach(() => {
  setupTestEnv()
})

describe('listDirectoryContents', () => {
  it('should list directory contents', async () => {
    const mockContents = [
      { name: 'file1.ts', type: 'file' as const },
      { name: 'dir1', type: 'dir' as const },
    ]
    ;(global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => mockContents,
    })

    const result = await listDirectoryContents('test-token', 'owner/repo', 'src')

    expect(result).toEqual({ entries: ['file1.ts', 'dir1'] })
  })

  it('should return error for non-existent directory', async () => {
    ;(global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => 'Not found',
    })

    const result = await listDirectoryContents('test-token', 'owner/repo', 'nonexistent')

    expect(result).toHaveProperty('error')
    expect((result as { error: string }).error).toBe('Directory not found')
  })
})

describe('fetchFileContents', () => {
  it('should fetch file contents', async () => {
    const mockContent = 'line1\nline2\nline3'
    ;(global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      text: async () => mockContent,
    })

    const result = await fetchFileContents('test-token', 'owner/repo', 'file.ts')

    expect(result).toEqual({ content: mockContent })
  })

  it('should truncate large files', async () => {
    const lines = Array.from({ length: 600 }, (_, i) => `line ${i + 1}`).join('\n')
    ;(global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      text: async () => lines,
    })

    const result = await fetchFileContents('test-token', 'owner/repo', 'large-file.ts', 500)

    expect(result).toHaveProperty('content')
    const content = (result as { content: string }).content
    expect(content).toContain('(truncated,')
    expect(content.split('\n').length).toBeLessThanOrEqual(502) // 500 lines + truncation marker
  })

  it('should return error for non-existent file', async () => {
    ;(global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => 'Not found',
    })

    const result = await fetchFileContents('test-token', 'owner/repo', 'nonexistent.ts')

    expect(result).toHaveProperty('error')
    expect((result as { error: string }).error).toBe('File not found')
  })
})
