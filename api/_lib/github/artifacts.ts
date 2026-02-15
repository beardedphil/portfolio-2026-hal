import type { PrFile } from './pullRequests.js'

/** Result type for artifact generation - includes error state when data unavailable */
export type ArtifactGenerationResult = {
  title: string
  body_md: string | null // null indicates error state - should not be stored
  error?: string // Error reason when body_md is null
}

export type ArtifactGenerationResponse = {
  artifacts: ArtifactGenerationResult[]
  errors: Array<{ artifactType: string; reason: string }>
}

function extractArtifactType(title: string): string {
  const lower = title.toLowerCase()
  if (lower.includes('changed files')) return 'changed-files'
  if (lower.includes('verification')) return 'verification'
  if (lower.includes('plan')) return 'plan'
  if (lower.includes('worklog')) return 'worklog'
  if (lower.includes('decisions')) return 'decisions'
  if (lower.includes('pm review')) return 'pm-review'
  if (lower.includes('git diff') || lower.includes('git-diff')) return 'git-diff'
  return 'unknown'
}

function buildGitDiff(prFiles: PrFile[]): string {
  const diffParts: string[] = []
  for (const file of prFiles) {
    if (!file.patch) {
      diffParts.push(`diff --git a/${file.filename} b/${file.filename}`, `Binary files differ`, '')
      continue
    }
    if (!file.patch.startsWith('diff --git')) {
      diffParts.push(
        `diff --git a/${file.filename} b/${file.filename}`,
        `--- a/${file.filename}`,
        `+++ b/${file.filename}`
      )
    }
    diffParts.push(file.patch, '')
  }
  return diffParts.join('\n').trim()
}

/** Generate the 7 implementation artifacts from PR data and Cursor summary. Stored in Supabase only.
 * Returns artifacts with body_md set to null when data is unavailable (e.g., no PR files, missing PR URL).
 * Callers should NOT store artifacts where body_md is null - instead show error state in UI.
 * Artifacts: plan, worklog, changed-files, decisions, verification, pm-review, git-diff
 */
export function generateImplementationArtifacts(
  displayId: string,
  summary: string,
  prUrl: string | null,
  prFiles: PrFile[] | null,
  prFilesError?: string | null
): ArtifactGenerationResponse {
  const modified = (prFiles || []).filter((f) => f.status === 'modified' || f.status === 'added')
  
  // Changed Files artifact: only generate if we have file data
  let changedFilesResult: ArtifactGenerationResult
  if (!prUrl) {
    changedFilesResult = {
      title: `Changed Files for ticket ${displayId}`,
      body_md: null,
      error: 'Pull request URL not available. Cannot determine changed files.',
    }
  } else if (prFilesError) {
    changedFilesResult = {
      title: `Changed Files for ticket ${displayId}`,
      body_md: null,
      error: `Failed to fetch PR files: ${prFilesError}`,
    }
  } else if (prFiles === null) {
    changedFilesResult = {
      title: `Changed Files for ticket ${displayId}`,
      body_md: null,
      error: 'PR files data not available. Cannot determine changed files.',
    }
  } else if (modified.length === 0) {
    changedFilesResult = {
      title: `Changed Files for ticket ${displayId}`,
      body_md: null,
      error: 'No files changed in this PR. If code changes exist, they may not be reflected in the PR yet.',
    }
  } else {
    changedFilesResult = {
      title: `Changed Files for ticket ${displayId}`,
      body_md: [
        '## Modified',
        '',
        ...modified.map(
          (f) =>
            `- \`${f.filename}\`\n  - ${f.status === 'added' ? 'Added' : 'Modified'} (+${f.additions} −${f.deletions})`
        ),
      ].join('\n'),
    }
  }

  const planBody = [
    `# Plan: ${displayId}`,
    '',
    '## Summary',
    summary || '(No summary provided)',
    '',
    '## Approach',
    'Implementation delivered via Cursor Cloud Agent.',
    '',
    prUrl ? `**Pull request:** ${prUrl}` : '',
  ].join('\n')

  const worklogBody = [
    `# Worklog: ${displayId}`,
    '',
    '## Session',
    `- Implementation completed by Cursor Cloud Agent`,
    `- Summary: ${summary || '(none)'}`,
    '',
    prUrl ? `- Pull request: ${prUrl}` : '',
  ].join('\n')

  const decisionsBody = [
    `# Decisions: ${displayId}`,
    '',
    '## Implementation',
    'Implementation delivered by Cursor Cloud Agent. Key decisions reflected in code changes.',
  ].join('\n')

  // Verification artifact: only generate if we have file data
  let verificationResult: ArtifactGenerationResult
  if (!prUrl || prFiles === null || prFilesError) {
    verificationResult = {
      title: `Verification for ticket ${displayId}`,
      body_md: null,
      error: prFilesError 
        ? `Failed to fetch PR files: ${prFilesError}. Cannot generate verification checklist.`
        : !prUrl
        ? 'Pull request URL not available. Cannot generate verification checklist.'
        : 'PR files data not available. Cannot generate verification checklist.',
    }
  } else if (modified.length === 0) {
    verificationResult = {
      title: `Verification for ticket ${displayId}`,
      body_md: null,
      error: 'No files changed in this PR. If code changes exist, they may not be reflected in the PR yet. Cannot generate verification checklist.',
    }
  } else {
    verificationResult = {
      title: `Verification for ticket ${displayId}`,
      body_md: [
        `# Verification: ${displayId}`,
        '',
        '## Code Review',
        '- [ ] Review changed files',
        '- [ ] Verify acceptance criteria met',
        '',
        '## Changed Files',
        ...modified.map((f) => `- \`${f.filename}\` (+${f.additions} −${f.deletions})`),
        '',
        '## Verification Steps',
        '- [ ] Run automated checks (build, lint)',
        '- [ ] Verify acceptance criteria are met',
        '- [ ] Check for regressions in adjacent UI',
      ].join('\n'),
    }
  }

  const pmReviewBody = [
    `# PM Review: ${displayId}`,
    '',
    '## Summary',
    summary || 'Implementation completed.',
    '',
    prUrl ? `**Pull request:** ${prUrl}` : '',
  ].join('\n')

  // Git diff artifact: generate unified diff from PR files
  let gitDiffResult: ArtifactGenerationResult
  if (!prUrl) {
    gitDiffResult = {
      title: `Git diff for ticket ${displayId}`,
      body_md: null,
      error: 'Pull request URL not available. Cannot generate git diff.',
    }
  } else if (prFilesError) {
    gitDiffResult = {
      title: `Git diff for ticket ${displayId}`,
      body_md: null,
      error: `Failed to fetch PR files: ${prFilesError}. Cannot generate git diff.`,
    }
  } else if (prFiles === null) {
    gitDiffResult = {
      title: `Git diff for ticket ${displayId}`,
      body_md: null,
      error: 'PR files data not available. Cannot generate git diff.',
    }
  } else if (prFiles.length === 0) {
    gitDiffResult = {
      title: `Git diff for ticket ${displayId}`,
      body_md: null,
      error: 'No files changed in this PR. If code changes exist, they may not be reflected in the PR yet.',
    }
  } else {
    const diff = buildGitDiff(prFiles)
    if (!diff) {
      gitDiffResult = {
        title: `Git diff for ticket ${displayId}`,
        body_md: null,
        error: 'No diff content available (all files may be binary or too large)',
      }
    } else {
      gitDiffResult = {
        title: `Git diff for ticket ${displayId}`,
        body_md: diff,
      }
    }
  }

  const allArtifacts: ArtifactGenerationResult[] = [
    { title: `Plan for ticket ${displayId}`, body_md: planBody },
    { title: `Worklog for ticket ${displayId}`, body_md: worklogBody },
    changedFilesResult,
    { title: `Decisions for ticket ${displayId}`, body_md: decisionsBody },
    verificationResult,
    { title: `PM Review for ticket ${displayId}`, body_md: pmReviewBody },
    gitDiffResult,
  ]

  // Separate artifacts with content from those with errors
  const artifacts: ArtifactGenerationResult[] = []
  const errors: Array<{ artifactType: string; reason: string }> = []
  
  for (const artifact of allArtifacts) {
    if (artifact.body_md === null) {
      errors.push({
        artifactType: extractArtifactType(artifact.title),
        reason: artifact.error || 'Data unavailable',
      })
    } else {
      artifacts.push(artifact)
    }
  }

  return { artifacts, errors }
}
