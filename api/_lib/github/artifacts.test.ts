import { describe, it, expect } from 'vitest'
import { generateImplementationArtifacts } from './artifacts.js'
import type { PrFile } from './pullRequests.js'

describe('generateImplementationArtifacts', () => {
  const mockPrFiles: PrFile[] = [
    {
      filename: 'src/file1.ts',
      status: 'modified',
      additions: 10,
      deletions: 5,
      patch: 'diff --git a/src/file1.ts b/src/file1.ts\n--- a/src/file1.ts\n+++ b/src/file1.ts\n@@ -1,3 +1,3 @@\n-test\n+test2',
    },
    {
      filename: 'src/file2.ts',
      status: 'added',
      additions: 20,
      deletions: 0,
      patch: 'diff --git a/src/file2.ts b/src/file2.ts\nnew file',
    },
  ]

  it('generates all 7 artifacts when PR data is available', () => {
    const result = generateImplementationArtifacts('HAL-0123', 'Test summary', 'https://github.com/owner/repo/pull/123', mockPrFiles)
    expect(result.artifacts).toHaveLength(7)
    expect(result.errors).toHaveLength(0)
  })

  it('generates changed-files artifact with file list', () => {
    const result = generateImplementationArtifacts('HAL-0123', 'Test', 'https://github.com/owner/repo/pull/123', mockPrFiles)
    const changedFiles = result.artifacts.find(a => a.title.includes('Changed Files'))
    expect(changedFiles).toBeDefined()
    expect(changedFiles?.body_md).toContain('src/file1.ts')
    expect(changedFiles?.body_md).toContain('src/file2.ts')
  })

  it('handles missing PR URL', () => {
    const result = generateImplementationArtifacts('HAL-0123', 'Test', null, mockPrFiles)
    const changedFilesError = result.errors.find(e => e.artifactType === 'changed-files')
    expect(changedFilesError).toBeDefined()
    expect(changedFilesError?.reason).toContain('Pull request URL not available')
    expect(result.artifacts.find(a => a.title.includes('Changed Files'))).toBeUndefined()
  })

  it('handles PR files error', () => {
    const result = generateImplementationArtifacts('HAL-0123', 'Test', 'https://github.com/owner/repo/pull/123', null, 'Network error')
    const changedFilesError = result.errors.find(e => e.artifactType === 'changed-files')
    expect(changedFilesError).toBeDefined()
    expect(changedFilesError?.reason).toContain('Failed to fetch PR files')
  })

  it('handles no modified files', () => {
    const result = generateImplementationArtifacts('HAL-0123', 'Test', 'https://github.com/owner/repo/pull/123', [])
    const changedFilesError = result.errors.find(e => e.artifactType === 'changed-files')
    expect(changedFilesError).toBeDefined()
    expect(changedFilesError?.reason).toContain('No files changed')
  })

  it('generates plan artifact', () => {
    const result = generateImplementationArtifacts('HAL-0123', 'Test summary', 'https://github.com/owner/repo/pull/123', mockPrFiles)
    const plan = result.artifacts.find(a => a.title.includes('Plan'))
    expect(plan).toBeDefined()
    expect(plan?.body_md).toContain('HAL-0123')
  })

  it('generates git-diff artifact when PR files available', () => {
    const result = generateImplementationArtifacts('HAL-0123', 'Test', 'https://github.com/owner/repo/pull/123', mockPrFiles)
    const gitDiff = result.artifacts.find(a => a.title.includes('Git diff'))
    expect(gitDiff).toBeDefined()
    expect(gitDiff?.body_md).toContain('diff --git')
  })

  it('handles binary files', () => {
    const binaryFiles: PrFile[] = [
      {
        filename: 'image.png',
        status: 'added',
        additions: 0,
        deletions: 0,
        patch: null,
      },
    ]
    const result = generateImplementationArtifacts('HAL-0123', 'Test', 'https://github.com/owner/repo/pull/123', binaryFiles)
    const gitDiff = result.artifacts.find(a => a.title.includes('Git diff'))
    expect(gitDiff?.body_md).toContain('Binary files differ')
  })
})
