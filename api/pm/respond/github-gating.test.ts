import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Session } from '../../_lib/github/session.js'
import { createGitHubFunctions } from './github-gating.js'

// Mock GitHub API functions
vi.mock('../../_lib/github/githubApi.js', () => ({
  fetchFileContents: vi.fn(),
  searchCode: vi.fn(),
  listDirectoryContents: vi.fn(),
}))

describe('github-gating', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Suppress console.warn in tests
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  describe('createGitHubFunctions', () => {
    it('should return all functions when both token and repoFullName are present', () => {
      const session: Session = {
        github: { accessToken: 'test-token' },
      } as Session

      const result = createGitHubFunctions(session, 'owner/repo')

      expect(result.githubReadFile).toBeDefined()
      expect(typeof result.githubReadFile).toBe('function')
      expect(result.githubSearchCode).toBeDefined()
      expect(typeof result.githubSearchCode).toBe('function')
      expect(result.githubListDirectory).toBeDefined()
      expect(typeof result.githubListDirectory).toBe('function')
    })

    it('should return undefined functions when token is missing', () => {
      const session: Session = {
        github: undefined,
      } as Session

      const result = createGitHubFunctions(session, 'owner/repo')

      expect(result.githubReadFile).toBeUndefined()
      expect(result.githubSearchCode).toBeUndefined()
      expect(result.githubListDirectory).toBeUndefined()
    })

    it('should return undefined functions when repoFullName is missing', () => {
      const session: Session = {
        github: { accessToken: 'test-token' },
      } as Session

      const result = createGitHubFunctions(session, undefined)

      expect(result.githubReadFile).toBeUndefined()
      expect(result.githubSearchCode).toBeUndefined()
      expect(result.githubListDirectory).toBeUndefined()
    })

    it('should return undefined functions when both are missing', () => {
      const session: Session = {
        github: undefined,
      } as Session

      const result = createGitHubFunctions(session, undefined)

      expect(result.githubReadFile).toBeUndefined()
      expect(result.githubSearchCode).toBeUndefined()
      expect(result.githubListDirectory).toBeUndefined()
    })

    it('should log warning when repoFullName provided but no token', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn')
      const session: Session = {
        github: undefined,
      } as Session

      createGitHubFunctions(session, 'owner/repo')

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('repoFullName provided')
      )
    })

    it('should log warning when token available but no repoFullName', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn')
      const session: Session = {
        github: { accessToken: 'test-token' },
      } as Session

      createGitHubFunctions(session, undefined)

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('GitHub token available but no repoFullName')
      )
    })
  })
})
