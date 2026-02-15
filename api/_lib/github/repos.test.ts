/**
 * Tests for GitHub API repository functions.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { listRepos, listBranches, type GithubRepo, type GithubBranch } from './index'
import { setupTestEnv } from './test-helpers'

beforeEach(() => {
  setupTestEnv()
})

describe('listRepos', () => {
  it('should list repositories with pagination', async () => {
    const mockRepos: GithubRepo[] = [
      {
        id: 1,
        full_name: 'owner/repo1',
        private: false,
        default_branch: 'main',
        html_url: 'https://github.com/owner/repo1',
      },
    ]
    ;(global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => mockRepos,
    })

    const result = await listRepos('test-token', 1)

    expect(result).toEqual(mockRepos)
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('per_page=100'),
      expect.any(Object)
    )
  })
})

describe('listBranches', () => {
  it('should list branches for valid repo', async () => {
    const mockBranches: GithubBranch[] = [{ name: 'main' }, { name: 'develop' }]
    ;(global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => mockBranches,
    })

    const result = await listBranches('test-token', 'owner/repo')

    expect(result).toEqual({ branches: mockBranches })
  })

  it('should return error for invalid repo format', async () => {
    const result = await listBranches('test-token', 'invalid-repo')

    expect(result).toHaveProperty('error')
    expect((result as { error: string }).error).toContain('Invalid repo')
  })
})
