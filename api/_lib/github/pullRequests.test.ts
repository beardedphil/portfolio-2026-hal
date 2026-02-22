import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchPullRequestFiles, createDraftPullRequest, fetchPullRequestDiff } from './pullRequests.js'
import * as client from './client.js'

vi.mock('./client.js', () => ({
  githubFetch: vi.fn(),
}))

describe('fetchPullRequestFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches PR files successfully', async () => {
    const mockFiles = [
      { filename: 'file1.ts', status: 'modified', additions: 10, deletions: 5, patch: 'diff...' },
    ]
    vi.mocked(client.githubFetch).mockResolvedValue(mockFiles)

    const result = await fetchPullRequestFiles('token', 'https://github.com/owner/repo/pull/123')

    expect('files' in result).toBe(true)
    if ('files' in result) {
      expect(result.files).toHaveLength(1)
      expect(result.files[0].filename).toBe('file1.ts')
    }
  })

  it('handles invalid PR URL', async () => {
    const result = await fetchPullRequestFiles('token', 'invalid-url')
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toBe('Invalid PR URL')
    }
  })

  it('handles non-array response', async () => {
    vi.mocked(client.githubFetch).mockResolvedValue(null)
    const result = await fetchPullRequestFiles('token', 'https://github.com/owner/repo/pull/123')
    expect('files' in result).toBe(true)
    if ('files' in result) {
      expect(result.files).toEqual([])
    }
  })

  it('handles API errors', async () => {
    vi.mocked(client.githubFetch).mockRejectedValue(new Error('API error'))
    const result = await fetchPullRequestFiles('token', 'https://github.com/owner/repo/pull/123')
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toBe('API error')
    }
  })
})

describe('createDraftPullRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates draft PR successfully', async () => {
    const mockPr = {
      html_url: 'https://github.com/owner/repo/pull/123',
      number: 123,
      head: { sha: 'abc123', ref: 'feature' },
      base: { sha: 'def456', ref: 'main' },
      draft: true,
    }
    vi.mocked(client.githubFetch).mockResolvedValue(mockPr)

    const result = await createDraftPullRequest(
      'token',
      'owner/repo',
      'Test PR',
      'PR body',
      'feature',
      'main'
    )

    expect('pr' in result).toBe(true)
    if ('pr' in result) {
      expect(result.pr.number).toBe(123)
      expect(result.pr.draft).toBe(true)
    }
  })

  it('handles invalid repo format', async () => {
    const result = await createDraftPullRequest('token', 'invalid', 'Title', 'Body', 'head', 'base')
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toContain('Invalid repo')
    }
  })

  it('handles API errors', async () => {
    vi.mocked(client.githubFetch).mockRejectedValue(new Error('API error'))
    const result = await createDraftPullRequest(
      'token',
      'owner/repo',
      'Title',
      'Body',
      'head',
      'base'
    )
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toBe('API error')
    }
  })
})

describe('fetchPullRequestDiff', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches and combines PR diff', async () => {
    const mockFiles = [
      { filename: 'file1.ts', status: 'modified', additions: 10, deletions: 5, patch: 'diff1' },
      { filename: 'file2.ts', status: 'added', additions: 20, deletions: 0, patch: 'diff2' },
    ]
    vi.mocked(client.githubFetch).mockResolvedValue(mockFiles)

    const result = await fetchPullRequestDiff('token', 'https://github.com/owner/repo/pull/123')

    expect('diff' in result).toBe(true)
    if ('diff' in result) {
      expect(result.diff).toContain('diff1')
      expect(result.diff).toContain('diff2')
    }
  })

  it('handles empty file list', async () => {
    vi.mocked(client.githubFetch).mockResolvedValue([])
    const result = await fetchPullRequestDiff('token', 'https://github.com/owner/repo/pull/123')
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toContain('No files changed')
    }
  })

  it('handles fetch files error', async () => {
    vi.mocked(client.githubFetch).mockRejectedValue(new Error('API error'))
    const result = await fetchPullRequestDiff('token', 'https://github.com/owner/repo/pull/123')
    expect('error' in result).toBe(true)
  })
})
