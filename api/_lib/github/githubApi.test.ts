/**
 * Tests for GitHub API functions.
 * Tests-first refactoring: these tests ensure behavior is preserved when splitting githubApi.ts into modules.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  exchangeCodeForToken,
  githubFetch,
  getViewer,
  listRepos,
  listBranches,
  ensureInitialCommit,
  listDirectoryContents,
  fetchFileContents,
  fetchPullRequestFiles,
  fetchPullRequestDiff,
  generateImplementationArtifacts,
  searchCode,
  type GithubTokenResponse,
  type GithubUser,
  type GithubRepo,
  type GithubBranch,
  type CodeSearchMatch,
  type PrFile,
} from './index.js'

// Mock fetch globally
global.fetch = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  // Set required env vars
  process.env.GITHUB_CLIENT_ID = 'test-client-id'
  process.env.GITHUB_CLIENT_SECRET = 'test-client-secret'
})

describe('exchangeCodeForToken', () => {
  it('should exchange code for token successfully', async () => {
    const mockResponse: GithubTokenResponse = {
      access_token: 'test-token',
      token_type: 'bearer',
      scope: 'repo',
    }
    ;(global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    })

    const result = await exchangeCodeForToken({
      code: 'test-code',
      redirectUri: 'http://localhost:3000/callback',
    })

    expect(result).toEqual(mockResponse)
    expect(global.fetch).toHaveBeenCalledWith(
      'https://github.com/login/oauth/access_token',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      })
    )
  })

  it('should throw error on failed token exchange', async () => {
    ;(global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'bad_verification_code' }),
    })

    await expect(
      exchangeCodeForToken({
        code: 'invalid-code',
        redirectUri: 'http://localhost:3000/callback',
      })
    ).rejects.toThrow()
  })
})

describe('githubFetch', () => {
  it('should make authenticated request', async () => {
    const mockData = { id: 1, name: 'test' }
    ;(global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    })

    const result = await githubFetch<typeof mockData>('test-token', 'https://api.github.com/test')

    expect(result).toEqual(mockData)
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.github.com/test',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
          'X-GitHub-Api-Version': '2022-11-28',
        }),
      })
    )
  })

  it('should throw error on failed request', async () => {
    ;(global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => 'Not found',
    })

    await expect(githubFetch('test-token', 'https://api.github.com/test')).rejects.toThrow()
  })
})

describe('getViewer', () => {
  it('should fetch authenticated user', async () => {
    const mockUser: GithubUser = { login: 'testuser' }
    ;(global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => mockUser,
    })

    const result = await getViewer('test-token')

    expect(result).toEqual(mockUser)
  })
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

describe('generateImplementationArtifacts', () => {
  it('should generate all artifacts when PR data is available', () => {
    const prFiles: PrFile[] = [
      {
        filename: 'file1.ts',
        status: 'modified',
        additions: 10,
        deletions: 5,
        patch: 'diff content',
      },
    ]

    const result = generateImplementationArtifacts('0137', 'Test summary', 'https://github.com/owner/repo/pull/123', prFiles)

    expect(result.artifacts).toHaveLength(7)
    expect(result.errors).toHaveLength(0)
    expect(result.artifacts.find((a) => a.title.includes('Plan'))).toBeDefined()
    expect(result.artifacts.find((a) => a.title.includes('Changed Files'))).toBeDefined()
  })

  it('should return errors when PR data is unavailable', () => {
    const result = generateImplementationArtifacts('0137', 'Test summary', null, null)

    expect(result.errors.length).toBeGreaterThan(0)
    // Artifacts with null body_md are moved to errors array, so Changed Files should not be in artifacts
    expect(result.artifacts.find((a) => a.title.includes('Changed Files'))).toBeUndefined()
    // Verify the error exists in errors array
    expect(result.errors.find((e) => e.artifactType === 'changed-files')).toBeDefined()
  })
})

describe('searchCode', () => {
  it('should search code and return matches', async () => {
    const mockSearchResults = {
      items: [
        {
          path: 'src/file.ts',
          text_matches: [{ fragment: 'function test() { return true; }' }],
        },
      ],
    }
    ;(global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => mockSearchResults,
    })

    const result = await searchCode('test-token', 'owner/repo', 'test')

    expect(result).toHaveProperty('matches')
    expect((result as { matches: CodeSearchMatch[] }).matches.length).toBeGreaterThan(0)
  })

  it('should return error for invalid search', async () => {
    ;(global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 422,
      text: async () => 'Invalid search',
    })

    const result = await searchCode('test-token', 'owner/repo', 'invalid')

    expect(result).toHaveProperty('error')
    expect((result as { error: string }).error).toContain('Invalid search pattern')
  })
})
