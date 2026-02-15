/**
 * Tests for GitHub API artifact generation functions.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { generateImplementationArtifacts, type PrFile } from './index'
import { setupTestEnv } from './test-helpers'

beforeEach(() => {
  setupTestEnv()
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
