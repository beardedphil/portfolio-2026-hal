import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchPrHeadSha, fetchCheckRunsForCommit } from './checks.js'
import * as client from './client.js'

vi.mock('./client.js', () => ({
  githubFetch: vi.fn(),
}))

describe('fetchPrHeadSha', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('extracts head SHA from PR URL', async () => {
    const mockPr = {
      head: { sha: 'abc123' },
      html_url: 'https://github.com/owner/repo/pull/123',
    }
    vi.mocked(client.githubFetch).mockResolvedValue(mockPr)

    const result = await fetchPrHeadSha('token', 'https://github.com/owner/repo/pull/123')

    expect(result).toEqual({
      headSha: 'abc123',
      owner: 'owner',
      repo: 'repo',
      checksPageUrl: 'https://github.com/owner/repo/pull/123/checks',
    })
  })

  it('handles invalid PR URL', async () => {
    const result = await fetchPrHeadSha('token', 'invalid-url')
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toBe('Invalid PR URL')
    }
  })

  it('handles missing head SHA', async () => {
    vi.mocked(client.githubFetch).mockResolvedValue({ head: {} })

    const result = await fetchPrHeadSha('token', 'https://github.com/owner/repo/pull/123')

    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toBe('PR head SHA not found')
    }
  })

  it('handles API errors', async () => {
    vi.mocked(client.githubFetch).mockRejectedValue(new Error('API error'))

    const result = await fetchPrHeadSha('token', 'https://github.com/owner/repo/pull/123')

    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toBe('API error')
    }
  })
})

describe('fetchCheckRunsForCommit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches check runs successfully', async () => {
    const mockResponse = {
      check_runs: [
        { id: 1, name: 'Unit Tests', status: 'completed', conclusion: 'success', html_url: 'https://example.com' },
      ],
      total_count: 1,
    }
    vi.mocked(client.githubFetch).mockResolvedValue(mockResponse)

    const result = await fetchCheckRunsForCommit('token', 'owner', 'repo', 'sha123')

    expect('checkRuns' in result).toBe(true)
    if ('checkRuns' in result) {
      expect(result.checkRuns).toHaveLength(1)
      expect(result.checkRuns[0].name).toBe('Unit Tests')
    }
  })

  it('handles non-array check_runs', async () => {
    const mockResponse = {
      check_runs: null,
      total_count: 0,
    }
    vi.mocked(client.githubFetch).mockResolvedValue(mockResponse)

    const result = await fetchCheckRunsForCommit('token', 'owner', 'repo', 'sha123')

    expect('checkRuns' in result).toBe(true)
    if ('checkRuns' in result) {
      expect(result.checkRuns).toEqual([])
    }
  })

  it('handles API errors', async () => {
    vi.mocked(client.githubFetch).mockRejectedValue(new Error('Network error'))

    const result = await fetchCheckRunsForCommit('token', 'owner', 'repo', 'sha123')

    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toBe('Network error')
    }
  })
})
