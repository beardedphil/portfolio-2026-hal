import { describe, it, expect } from 'vitest'
import { hasGitHubRepo, createRepoUsageTracker } from './repoUsage.js'

describe('hasGitHubRepo', () => {
  it('returns true when repoFullName and githubReadFile are provided', () => {
    const config = {
      repoFullName: 'owner/repo',
      githubReadFile: async () => ({ content: 'test' }),
    }
    expect(hasGitHubRepo(config)).toBe(true)
  })

  it('returns false when repoFullName is missing', () => {
    const config = {
      githubReadFile: async () => ({ content: 'test' }),
    }
    expect(hasGitHubRepo(config)).toBe(false)
  })

  it('returns false when githubReadFile is missing', () => {
    const config = {
      repoFullName: 'owner/repo',
    }
    expect(hasGitHubRepo(config)).toBe(false)
  })

  it('returns false when repoFullName is empty string', () => {
    const config = {
      repoFullName: '',
      githubReadFile: async () => ({ content: 'test' }),
    }
    expect(hasGitHubRepo(config)).toBe(false)
  })

  it('returns false when repoFullName is whitespace only', () => {
    const config = {
      repoFullName: '   ',
      githubReadFile: async () => ({ content: 'test' }),
    }
    expect(hasGitHubRepo(config)).toBe(false)
  })
})

describe('createRepoUsageTracker', () => {
  it('creates tracker with empty records array', () => {
    const tracker = createRepoUsageTracker()
    expect(tracker.records).toEqual([])
  })

  it('tracks tool usage', () => {
    const tracker = createRepoUsageTracker()
    tracker.track('read_file', true, 'src/test.ts')
    tracker.track('search_files', false)

    expect(tracker.records).toEqual([
      { tool: 'read_file', usedGitHub: true, path: 'src/test.ts' },
      { tool: 'search_files', usedGitHub: false },
    ])
  })

  it('tracks multiple tool calls', () => {
    const tracker = createRepoUsageTracker()
    tracker.track('read_file', true, 'file1.ts')
    tracker.track('read_file', true, 'file2.ts')
    tracker.track('search_files', false, 'pattern')

    expect(tracker.records.length).toBe(3)
    expect(tracker.records[0]).toEqual({ tool: 'read_file', usedGitHub: true, path: 'file1.ts' })
    expect(tracker.records[1]).toEqual({ tool: 'read_file', usedGitHub: true, path: 'file2.ts' })
    expect(tracker.records[2]).toEqual({ tool: 'search_files', usedGitHub: false, path: 'pattern' })
  })
})
