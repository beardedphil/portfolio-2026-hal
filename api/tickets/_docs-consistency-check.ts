/**
 * Docs consistency check for Drift Gate (HAL-0768).
 * 
 * Deterministically computes which docs to check and validates them for consistency.
 * Returns findings in a stable, sorted order.
 */

import { fetchPullRequestFiles } from '../_lib/github/pullRequests.js'
import { fetchFileContents } from '../_lib/github/files.js'

export type DocsConsistencyFinding = {
  path: string
  ruleId: string
  message: string
  suggestedFix: string
}

export type DocsConsistencyResult = {
  passed: boolean
  findings: DocsConsistencyFinding[]
}

/**
 * Determines which docs to check for a given ticket and PR.
 * Returns a deterministic list of doc paths.
 */
export async function computeDocsToCheck(
  ticketId: string,
  ticketFilename: string | null,
  repoFullName: string,
  prUrl: string | null,
  githubToken: string | null
): Promise<{ paths: string[]; error?: string }> {
  const paths: string[] = []

  // 1. Ticket doc (if filename exists)
  if (ticketFilename) {
    const ticketDocPath = `docs/tickets/${ticketFilename}`
    paths.push(ticketDocPath)
  }

  // 2. Audit folder (if ticket ID can be extracted from filename)
  if (ticketFilename) {
    const ticketIdMatch = ticketFilename.match(/^(\d{4})-(.+)\.md$/)
    if (ticketIdMatch) {
      const numericId = ticketIdMatch[1]
      const slug = ticketIdMatch[2]
      // Audit folder pattern: docs/audit/{id}-{slug}/
      const auditFolderPrefix = `docs/audit/${numericId}-${slug}/`
      // Note: We can't list directory contents without GitHub API, so we'll check common files
      // This is a limitation - ideally we'd list the directory, but for now we check known files
      const commonAuditFiles = [
        'plan.md',
        'worklog.md',
        'decisions.md',
        'verification.md',
        'pm-review.md',
        'changed-files.md',
        'git-diff.md',
        'instructions-used.md',
        'qa-report.md',
      ]
      for (const file of commonAuditFiles) {
        paths.push(`${auditFolderPrefix}${file}`)
      }
    }
  }

  // 3. Docs changed in PR under docs/** and .cursor/rules/**
  if (prUrl && githubToken) {
    try {
      const filesResult = await fetchPullRequestFiles(githubToken, prUrl)
      if ('error' in filesResult) {
        return { paths, error: `Failed to fetch PR files: ${filesResult.error}` }
      }

      for (const file of filesResult.files) {
        const path = file.filename
        if (
          (path.startsWith('docs/') || path.startsWith('.cursor/rules/')) &&
          (path.endsWith('.md') || path.endsWith('.mdc'))
        ) {
          // Avoid duplicates
          if (!paths.includes(path)) {
            paths.push(path)
          }
        }
      }
    } catch (err) {
      return {
        paths,
        error: `Error fetching PR files: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  }

  // 4. Always check docs/process/** (all .md and .mdc files)
  // Note: We can't list directory contents without GitHub API, so we'll check known process docs
  // This is a limitation - ideally we'd recursively list docs/process/
  const knownProcessDocs = [
    'docs/process/hal-tool-call-contract.mdc',
    'docs/process/ready-to-start-checklist.md',
    'docs/process/status-message-template.mdc',
    'docs/process/MIGRATION_SUMMARY.md',
    'docs/process/split-repos-and-deployment.md',
    'docs/process/chat-ui-staging-test-procedure.mdc',
  ]
  for (const path of knownProcessDocs) {
    if (!paths.includes(path)) {
      paths.push(path)
    }
  }

  // Sort paths deterministically
  paths.sort()

  return { paths }
}

/**
 * Validates a markdown document for consistency.
 * Checks for required headings, proper heading levels, and canonical text.
 */
export function validateDocConsistency(
  path: string,
  content: string
): DocsConsistencyFinding[] {
  const findings: DocsConsistencyFinding[] = []
  const lines = content.split('\n')

  // Extract all headings with their levels and text
  const headings: Array<{ level: number; text: string; lineNum: number }> = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const h1Match = line.match(/^#\s+(.+)$/)
    const h2Match = line.match(/^##\s+(.+)$/)
    const h3Match = line.match(/^###\s+(.+)$/)
    const h4Match = line.match(/^####\s+(.+)$/)

    if (h1Match) headings.push({ level: 1, text: h1Match[1].trim(), lineNum: i + 1 })
    if (h2Match) headings.push({ level: 2, text: h2Match[1].trim(), lineNum: i + 1 })
    if (h3Match) headings.push({ level: 3, text: h3Match[1].trim(), lineNum: i + 1 })
    if (h4Match) headings.push({ level: 4, text: h4Match[1].trim(), lineNum: i + 1 })
  }

  // Check for pseudo-headings (bold text with colons)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Check for **Section Name:** pattern
    const boldColonMatch = line.match(/^\*\*(.+?):\*\*\s*$/)
    if (boldColonMatch) {
      const sectionName = boldColonMatch[1].trim()
      // Check if this looks like it should be a heading
      const looksLikeHeading =
        sectionName.toLowerCase().includes('goal') ||
        sectionName.toLowerCase().includes('acceptance') ||
        sectionName.toLowerCase().includes('criteria') ||
        sectionName.toLowerCase().includes('constraints') ||
        sectionName.toLowerCase().includes('non-goals') ||
        sectionName.toLowerCase().includes('deliverable')

      if (looksLikeHeading) {
        findings.push({
          path,
          ruleId: 'pseudo-heading',
          message: `Line ${i + 1}: Found pseudo-heading "${sectionName}" (bold text with colon) instead of proper markdown heading`,
          suggestedFix: `Replace "**${sectionName}:**" with "## ${sectionName}" (use H2 heading level)`,
        })
      }
    }

    // Check for plain text with colon that looks like a heading
    const plainColonMatch = line.match(/^([A-Z][^:]+):\s*$/)
    if (plainColonMatch) {
      const sectionName = plainColonMatch[1].trim()
      const looksLikeHeading =
        sectionName.toLowerCase().includes('goal') ||
        sectionName.toLowerCase().includes('acceptance') ||
        sectionName.toLowerCase().includes('criteria') ||
        sectionName.toLowerCase().includes('constraints') ||
        sectionName.toLowerCase().includes('non-goals') ||
        sectionName.toLowerCase().includes('deliverable')

      if (looksLikeHeading) {
        findings.push({
          path,
          ruleId: 'pseudo-heading',
          message: `Line ${i + 1}: Found pseudo-heading "${sectionName}" (plain text with colon) instead of proper markdown heading`,
          suggestedFix: `Replace "${sectionName}:" with "## ${sectionName}" (use H2 heading level)`,
        })
      }
    }
  }

  // For ticket docs, check for required headings with canonical text
  if (path.startsWith('docs/tickets/')) {
    const requiredHeadings = [
      'Goal (one sentence)',
      'Human-verifiable deliverable (UI-only)',
      'Acceptance criteria (UI-only)',
    ]

    for (const required of requiredHeadings) {
      const found = headings.find((h) => h.text === required)
      if (!found) {
        findings.push({
          path,
          ruleId: 'missing-required-heading',
          message: `Missing required heading: "${required}"`,
          suggestedFix: `Add "## ${required}" as an H2 heading in the document`,
        })
      } else if (found.level !== 2) {
        findings.push({
          path,
          ruleId: 'wrong-heading-level',
          message: `Heading "${required}" found at line ${found.lineNum} but uses H${found.level} instead of H2`,
          suggestedFix: `Change "##${'#'.repeat(found.level - 2)} ${required}" to "## ${required}" (use H2 heading level)`,
        })
      }
    }

    // Check for heading level consistency (required sections should be H2)
    const requiredSectionNames = ['Goal', 'Human-verifiable deliverable', 'Acceptance criteria']
    for (const heading of headings) {
      for (const requiredName of requiredSectionNames) {
        if (heading.text.includes(requiredName) && heading.level !== 2) {
          findings.push({
            path,
            ruleId: 'wrong-heading-level',
            message: `Heading "${heading.text}" at line ${heading.lineNum} should be H2 but is H${heading.level}`,
            suggestedFix: `Change heading level from H${heading.level} to H2: "## ${heading.text}"`,
          })
        }
      }
    }
  }

  // Check for inconsistent heading levels (skipping levels)
  let lastLevel = 0
  for (const heading of headings) {
    if (lastLevel > 0 && heading.level > lastLevel + 1) {
      findings.push({
        path,
        ruleId: 'skipped-heading-level',
        message: `Line ${heading.lineNum}: Heading level jumps from H${lastLevel} to H${heading.level} (skipped H${lastLevel + 1})`,
        suggestedFix: `Adjust heading hierarchy to avoid skipping levels. Consider changing to H${lastLevel + 1} or adjusting previous headings.`,
      })
    }
    lastLevel = heading.level
  }

  // Check for duplicate top-level headings
  const topLevelHeadings = headings.filter((h) => h.level === 1 || h.level === 2)
  const headingTexts = new Map<string, number[]>()
  for (const heading of topLevelHeadings) {
    const existing = headingTexts.get(heading.text) || []
    existing.push(heading.lineNum)
    headingTexts.set(heading.text, existing)
  }
  for (const [text, lineNums] of headingTexts.entries()) {
    if (lineNums.length > 1) {
      findings.push({
        path,
        ruleId: 'duplicate-heading',
        message: `Heading "${text}" appears ${lineNums.length} times (lines: ${lineNums.join(', ')})`,
        suggestedFix: `Remove duplicate heading "${text}" or rename one to be unique`,
      })
    }
  }

  return findings
}

/**
 * Runs the docs consistency check for a ticket.
 * Returns pass/fail result with findings in deterministic order.
 * 
 * @param ticketBodyMd - Ticket body markdown from Supabase (for ticket doc check)
 * @param githubToken - Optional GitHub token for fetching files from repo
 */
export async function checkDocsConsistency(
  ticketId: string,
  ticketFilename: string | null,
  ticketBodyMd: string | null,
  repoFullName: string,
  prUrl: string | null,
  githubToken: string | null
): Promise<DocsConsistencyResult> {
  // Compute which docs to check
  const { paths, error } = await computeDocsToCheck(ticketId, ticketFilename, repoFullName, prUrl, githubToken)
  if (error && githubToken) {
    // Only fail if we have a token and still got an error
    return {
      passed: false,
      findings: [
        {
          path: 'system',
          ruleId: 'docs-computation-error',
          message: `Failed to compute docs to check: ${error}`,
          suggestedFix: 'Check PR URL and GitHub token are valid, and retry the operation',
        },
      ],
    }
  }

  // Validate each doc
  const allFindings: DocsConsistencyFinding[] = []

  for (const path of paths) {
    let content: string | null = null

    // Special case: ticket doc - use body_md from Supabase if available
    if (path.startsWith('docs/tickets/') && ticketBodyMd) {
      content = ticketBodyMd
    } else if (githubToken) {
      // Fetch file content from GitHub
      try {
        const contentResult = await fetchFileContents(githubToken, repoFullName, path)
        if ('error' in contentResult) {
          // File doesn't exist or can't be read - this is okay, skip it
          continue
        }
        content = contentResult.content
      } catch (err) {
        // Error fetching file - log but continue
        allFindings.push({
          path,
          ruleId: 'file-fetch-error',
          message: `Failed to fetch file: ${err instanceof Error ? err.message : String(err)}`,
          suggestedFix: 'Check file path and GitHub token are valid',
        })
        continue
      }
    } else {
      // No GitHub token and not ticket doc - skip
      continue
    }

    if (content) {
      const findings = validateDocConsistency(path, content)
      allFindings.push(...findings)
    }
  }

  // Sort findings deterministically: by path, then by ruleId, then by message
  allFindings.sort((a, b) => {
    if (a.path !== b.path) return a.path.localeCompare(b.path)
    if (a.ruleId !== b.ruleId) return a.ruleId.localeCompare(b.ruleId)
    return a.message.localeCompare(b.message)
  })

  return {
    passed: allFindings.length === 0,
    findings: allFindings,
  }
}
