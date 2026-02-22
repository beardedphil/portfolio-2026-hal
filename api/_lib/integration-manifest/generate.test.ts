import { describe, it, expect } from 'vitest'
import { generateManifestChecksum } from './generate.js'
import type { IntegrationManifestV0 } from './types.js'

describe('generateManifestChecksum', () => {
  it('generates checksum for manifest', () => {
    const manifest: IntegrationManifestV0 = {
      schema_version: 'v0',
      repo_full_name: 'test/repo',
      default_branch: 'main',
      project_id: 'test-project',
      env_identifiers: {},
      project_manifest: {
        goal: 'Test goal',
        stack: {},
        constraints: {},
        conventions: {},
      },
      generated_at: '2024-01-01T00:00:00Z',
    }
    const checksum = generateManifestChecksum(manifest)
    expect(checksum).toMatch(/^[0-9a-f]{64}$/)
  })

  it('produces consistent checksums for same input', () => {
    const manifest: IntegrationManifestV0 = {
      schema_version: 'v0',
      repo_full_name: 'test/repo',
      default_branch: 'main',
      project_id: 'test-project',
      env_identifiers: {},
      project_manifest: {
        goal: 'Test goal',
        stack: {},
        constraints: {},
        conventions: {},
      },
      generated_at: '2024-01-01T00:00:00Z',
    }
    const checksum1 = generateManifestChecksum(manifest)
    const checksum2 = generateManifestChecksum(manifest)
    expect(checksum1).toBe(checksum2)
  })

  it('produces different checksums for different inputs', () => {
    const manifest1: IntegrationManifestV0 = {
      schema_version: 'v0',
      repo_full_name: 'test/repo1',
      default_branch: 'main',
      project_id: 'test-project',
      env_identifiers: {},
      project_manifest: {
        goal: 'Test goal',
        stack: {},
        constraints: {},
        conventions: {},
      },
      generated_at: '2024-01-01T00:00:00Z',
    }
    const manifest2: IntegrationManifestV0 = {
      schema_version: 'v0',
      repo_full_name: 'test/repo2',
      default_branch: 'main',
      project_id: 'test-project',
      env_identifiers: {},
      project_manifest: {
        goal: 'Test goal',
        stack: {},
        constraints: {},
        conventions: {},
      },
      generated_at: '2024-01-01T00:00:00Z',
    }
    const checksum1 = generateManifestChecksum(manifest1)
    const checksum2 = generateManifestChecksum(manifest2)
    expect(checksum1).not.toBe(checksum2)
  })

  it('is deterministic with object key order', () => {
    const manifest1: IntegrationManifestV0 = {
      schema_version: 'v0',
      repo_full_name: 'test/repo',
      default_branch: 'main',
      project_id: 'test-project',
      env_identifiers: {},
      project_manifest: {
        goal: 'Test goal',
        stack: {},
        constraints: {},
        conventions: {},
      },
      generated_at: '2024-01-01T00:00:00Z',
    }
    // Same content, different key order (shouldn't matter due to canonicalization)
    const manifest2: IntegrationManifestV0 = {
      generated_at: '2024-01-01T00:00:00Z',
      project_manifest: {
        goal: 'Test goal',
        stack: {},
        constraints: {},
        conventions: {},
      },
      env_identifiers: {},
      project_id: 'test-project',
      default_branch: 'main',
      repo_full_name: 'test/repo',
      schema_version: 'v0',
    }
    const checksum1 = generateManifestChecksum(manifest1)
    const checksum2 = generateManifestChecksum(manifest2)
    expect(checksum1).toBe(checksum2)
  })
})
