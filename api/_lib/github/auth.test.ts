/**
 * Tests for GitHub API authentication functions.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { exchangeCodeForToken, githubFetch, getViewer, type GithubTokenResponse, type GithubUser } from './index'
import { setupTestEnv } from './test-helpers'

beforeEach(() => {
  setupTestEnv()
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
