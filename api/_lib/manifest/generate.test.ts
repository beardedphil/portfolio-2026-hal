/**
 * Tests for Integration Manifest v0 generation
 */

import { describe, it, expect } from 'vitest'
import { generateManifest, computeManifestHash, type ManifestInputs } from './generate.js'

describe('generateManifest', () => {
  const baseInputs: ManifestInputs = {
    repoFullName: 'test/repo',
    defaultBranch: 'main',
    schemaVersion: 'v0',
    envIdentifiers: {},
    repoFiles: {},
  }

  it('generates deterministic manifest for same inputs', () => {
    const manifest1 = generateManifest(baseInputs)
    const manifest2 = generateManifest(baseInputs)

    expect(manifest1).toEqual(manifest2)
  })

  it('generates same hash for identical manifests', () => {
    const manifest1 = generateManifest(baseInputs)
    const manifest2 = generateManifest(baseInputs)

    const hash1 = computeManifestHash(manifest1)
    const hash2 = computeManifestHash(manifest2)

    expect(hash1).toBe(hash2)
  })

  it('generates different hash for different manifests', () => {
    const manifest1 = generateManifest(baseInputs)

    const inputs2: ManifestInputs = {
      ...baseInputs,
      repoFullName: 'test/other-repo',
    }
    const manifest2 = generateManifest(inputs2)

    const hash1 = computeManifestHash(manifest1)
    const hash2 = computeManifestHash(manifest2)

    expect(hash1).not.toBe(hash2)
  })

  it('extracts goal from README heading', () => {
    const inputs: ManifestInputs = {
      ...baseInputs,
      repoFiles: {
        readme: { content: '# My Awesome Project\n\nThis is a test project.' },
      },
    }

    const manifest = generateManifest(inputs)
    expect(manifest.goal).toBe('My Awesome Project')
  })

  it('extracts goal from package.json description', () => {
    const inputs: ManifestInputs = {
      ...baseInputs,
      repoFiles: {
        packageJson: { content: JSON.stringify({ name: 'test', description: 'Test project' }) },
      },
    }

    const manifest = generateManifest(inputs)
    expect(manifest.goal).toBe('Test project')
  })

  it('falls back to repo name when no sources available', () => {
    const manifest = generateManifest(baseInputs)
    expect(manifest.goal).toBe('repo')
  })

  it('extracts stack from package.json dependencies', () => {
    const inputs: ManifestInputs = {
      ...baseInputs,
      repoFiles: {
        packageJson: {
          content: JSON.stringify({
            dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0' },
            devDependencies: { typescript: '^5.0.0' },
          }),
        },
      },
    }

    const manifest = generateManifest(inputs)
    expect(manifest.stack).toContain('react')
    expect(manifest.stack).toContain('react-dom')
    expect(manifest.stack).toContain('typescript')
  })

  it('sorts stack deterministically', () => {
    const inputs: ManifestInputs = {
      ...baseInputs,
      repoFiles: {
        packageJson: {
          content: JSON.stringify({
            dependencies: { zlib: '1.0.0', axios: '1.0.0' },
          }),
        },
      },
    }

    const manifest = generateManifest(inputs)
    const stackCopy = [...manifest.stack].sort()
    expect(manifest.stack).toEqual(stackCopy)
  })

  it('extracts constraints from .cursor/rules files', () => {
    const inputs: ManifestInputs = {
      ...baseInputs,
      repoFiles: {
        cursorRules: [
          {
            content: `# Rules

## Constraints

- Must use TypeScript
- No direct database access
- All API calls through HAL endpoints`,
          },
        ],
      },
    }

    const manifest = generateManifest(inputs)
    expect(manifest.constraints.length).toBeGreaterThan(0)
    expect(manifest.constraints.some((c) => c.includes('TypeScript'))).toBe(true)
  })

  it('extracts conventions from docs/process files', () => {
    const inputs: ManifestInputs = {
      ...baseInputs,
      repoFiles: {
        docs: [
          {
            content: `# Process

## Conventions

- Use semantic versioning
- Follow conventional commits`,
          },
        ],
      },
    }

    const manifest = generateManifest(inputs)
    expect(manifest.conventions.length).toBeGreaterThan(0)
  })

  it('sorts constraints and conventions deterministically', () => {
    const inputs: ManifestInputs = {
      ...baseInputs,
      repoFiles: {
        cursorRules: [
          {
            content: `## Constraints

- Z constraint
- A constraint
- M constraint`,
          },
        ],
      },
    }

    const manifest = generateManifest(inputs)
    const constraintsCopy = [...manifest.constraints].sort()
    expect(manifest.constraints).toEqual(constraintsCopy)
  })

  it('does not include secrets in manifest', () => {
    const inputs: ManifestInputs = {
      ...baseInputs,
      repoFiles: {
        packageJson: {
          content: JSON.stringify({
            name: 'test',
            scripts: {
              build: 'API_KEY=secret123 npm run build',
            },
          }),
        },
        readme: {
          content: 'Password: mypassword123\nToken: ghp_abcdef123456',
        },
      },
    }

    const manifest = generateManifest(inputs)
    const manifestStr = JSON.stringify(manifest)

    // Check that common secret patterns are not present
    expect(manifestStr).not.toContain('secret123')
    expect(manifestStr).not.toContain('mypassword123')
    expect(manifestStr).not.toContain('ghp_abcdef123456')
  })
})
