/**
 * GitHub API module - re-exports all functions for backward compatibility.
 * This file maintains the original githubApi.ts interface while the implementation
 * is split across smaller modules (auth.ts, client.ts, repos.ts, files.ts, etc.)
 */

// Auth
export { exchangeCodeForToken, type GithubTokenResponse } from './auth.js'

// Client
export { githubFetch, getViewer, type GithubUser } from './client.js'

// Repos
export {
  listRepos,
  listBranches,
  ensureInitialCommit,
  type GithubRepo,
  type GithubBranch,
} from './repos.js'

// Files
export { listDirectoryContents, fetchFileContents } from './files.js'

// Pull Requests
export {
  fetchPullRequestFiles,
  fetchPullRequestDiff,
  createDraftPullRequest,
  type PrFile,
  type PullRequest,
} from './pullRequests.js'

// Artifacts
export {
  generateImplementationArtifacts,
  type ArtifactGenerationResult,
  type ArtifactGenerationResponse,
} from './artifacts.js'

// Search
export { searchCode, type CodeSearchMatch } from './search.js'
