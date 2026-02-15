/**
 * Tests for GitHub API code search functions.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { searchCode, type CodeSearchMatch } from './index'
import { setupTestEnv } from './test-helpers'

beforeEach(() => {
  setupTestEnv()
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
