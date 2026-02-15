/**
 * Tests for GitHub API pull request functions.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { fetchPullRequestFiles, fetchPullRequestDiff, type PrFile } from './index'
import { setupTestEnv } from './test-helpers'

beforeEach(() => {
  setupTestEnv()
})

describe('fetchPullRequestFiles', () => {
  it('should fetch PR files', async () => {
    const mockFiles: PrFile[] = [
      {
        filename: 'file1.ts',
        status: 'modified',
        additions: 10,
        deletions: 5,
        patch: 'diff content',
      },
    ]
    ;(global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => mockFiles,
    })

    const result = await fetchPullRequestFiles(
      'test-token',
      'https://github.com/owner/repo/pull/123'
    )

    expect(result).toEqual({ files: mockFiles })
  })

  it('should return error for invalid PR URL', async () => {
    const result = await fetchPullRequestFiles('test-token', 'invalid-url')

    expect(result).toHaveProperty('error')
    expect((result as { error: string }).error).toBe('Invalid PR URL')
  })
})

describe('fetchPullRequestDiff', () => {
  it('should generate unified diff from PR files', async () => {
    const mockFiles: PrFile[] = [
      {
        filename: 'file1.ts',
        status: 'modified',
        additions: 2,
        deletions: 1,
        patch: 'diff --git a/file1.ts b/file1.ts\n--- a/file1.ts\n+++ b/file1.ts\n@@ -1 +1,2 @@\n-old\n+new',
      },
    ]
    ;(global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => mockFiles,
    })

    const result = await fetchPullRequestDiff('test-token', 'https://github.com/owner/repo/pull/123')

    expect(result).toHaveProperty('diff')
    expect((result as { diff: string }).diff).toContain('diff --git')
  })
})
