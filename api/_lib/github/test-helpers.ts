/**
 * Shared test helpers for GitHub API tests
 */

import { vi } from 'vitest'

// Mock fetch globally
global.fetch = vi.fn()

export function setupTestEnv() {
  vi.clearAllMocks()
  // Set required env vars
  process.env.GITHUB_CLIENT_ID = 'test-client-id'
  process.env.GITHUB_CLIENT_SECRET = 'test-client-secret'
}
