/**
 * Integration Manifest v0 generation logic
 * 
 * Generates deterministic manifests from repository files with stable ordering.
 */

import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'
import { fetchFileContents, listDirectoryContents } from '../_lib/github/files.js'

export interface IntegrationManifest {
  goal: string
  stack: string[]
  constraints: string[]
  conventions: string[]
}

export interface ManifestGenerationInput {
  repoFullName: string
  defaultBranch: string
  githubToken: string
}

/**
 * Generates a deterministic Integration Manifest v0 from repository files.
 * 
 * Field derivation precedence:
 * - goal: README.md title/description > package.json description > repo name
 * - stack: package.json dependencies/devDependencies (sorted)
 * - constraints: .cursor/rules/*.mdc files (sorted by filename)
 * - conventions: docs/process/*.mdc files (sorted by filename)
 */
export async function generateIntegrationManifest(
  input: ManifestGenerationInput
): Promise<{ manifest: IntegrationManifest; checksum: string }> {
  const { repoFullName, defaultBranch, githubToken } = input

  // Fetch repository files
  const [readmeResult, packageJsonResult, rulesFiles, processFiles] = await Promise.all([
    fetchFileContents(githubToken, repoFullName, 'README.md', 1000, defaultBranch),
    fetchFileContents(githubToken, repoFullName, 'package.json', 500, defaultBranch),
    listRulesFiles(githubToken, repoFullName, defaultBranch),
    listProcessFiles(githubToken, repoFullName, defaultBranch),
  ])

  // Extract goal
  const goal = extractGoal(readmeResult, packageJsonResult, repoFullName)

  // Extract stack
  const stack = extractStack(packageJsonResult)

  // Extract constraints
  const constraints = await extractConstraints(githubToken, repoFullName, rulesFiles, defaultBranch)

  // Extract conventions
  const conventions = await extractConventions(githubToken, repoFullName, processFiles, defaultBranch)

  // Build manifest with stable ordering
  const manifest: IntegrationManifest = {
    goal,
    stack: stack.sort(), // Stable sort
    constraints: constraints.sort(), // Stable sort
    conventions: conventions.sort(), // Stable sort
  }

  // Generate deterministic checksum
  const checksum = generateChecksum(manifest, repoFullName, defaultBranch)

  return { manifest, checksum }
}

/**
 * Extract goal from README or package.json with precedence:
 * 1. README.md first heading or description
 * 2. package.json description
 * 3. Repository name as fallback
 */
function extractGoal(
  readmeResult: { content: string } | { error: string },
  packageJsonResult: { content: string } | { error: string },
  repoFullName: string
): string {
  // Try README first
  if ('content' in readmeResult) {
    const readme = readmeResult.content
    // Look for first H1 or H2 heading
    const h1Match = readme.match(/^#\s+(.+)$/m)
    if (h1Match) {
      return h1Match[1].trim()
    }
    const h2Match = readme.match(/^##\s+(.+)$/m)
    if (h2Match) {
      return h2Match[1].trim()
    }
    // Look for description in first paragraph
    const firstParagraph = readme.split('\n\n')[0]?.trim()
    if (firstParagraph && firstParagraph.length > 10) {
      return firstParagraph.slice(0, 200) // Limit length
    }
  }

  // Try package.json description
  if ('content' in packageJsonResult) {
    try {
      const pkg = JSON.parse(packageJsonResult.content) as { description?: string; name?: string }
      if (pkg.description && pkg.description.trim()) {
        return pkg.description.trim()
      }
      if (pkg.name && pkg.name.trim()) {
        return pkg.name.trim()
      }
    } catch {
      // Invalid JSON, continue to fallback
    }
  }

  // Fallback to repo name
  return repoFullName.split('/').pop() || repoFullName
}

/**
 * Extract stack from package.json dependencies and devDependencies.
 * Returns sorted list of package names.
 */
function extractStack(packageJsonResult: { content: string } | { error: string }): string[] {
  if ('error' in packageJsonResult) {
    return []
  }

  try {
    const pkg = JSON.parse(packageJsonResult.content) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }

    const stack: string[] = []
    if (pkg.dependencies) {
      stack.push(...Object.keys(pkg.dependencies))
    }
    if (pkg.devDependencies) {
      stack.push(...Object.keys(pkg.devDependencies))
    }

    return stack
  } catch {
    return []
  }
}

/**
 * List all .mdc files in .cursor/rules/ directory.
 */
async function listRulesFiles(
  githubToken: string,
  repoFullName: string,
  defaultBranch: string
): Promise<string[]> {
  const result = await listDirectoryContents(githubToken, repoFullName, '.cursor/rules', defaultBranch)
  if ('error' in result) {
    return []
  }
  return result.entries.filter((name) => name.endsWith('.mdc')).sort() // Stable sort
}

/**
 * List all .mdc files in docs/process/ directory.
 */
async function listProcessFiles(
  githubToken: string,
  repoFullName: string,
  defaultBranch: string
): Promise<string[]> {
  const result = await listDirectoryContents(githubToken, repoFullName, 'docs/process', defaultBranch)
  if ('error' in result) {
    return []
  }
  return result.entries.filter((name) => name.endsWith('.mdc')).sort() // Stable sort
}

/**
 * Extract constraints from .cursor/rules/*.mdc files.
 * Reads file contents and extracts constraint-related content.
 */
async function extractConstraints(
  githubToken: string,
  repoFullName: string,
  rulesFiles: string[],
  defaultBranch: string
): Promise<string[]> {
  const constraints: string[] = []

  for (const filename of rulesFiles) {
    const result = await fetchFileContents(
      githubToken,
      repoFullName,
      `.cursor/rules/${filename}`,
      500,
      defaultBranch
    )
    if ('content' in result) {
      const content = result.content
      // Extract constraint-related sections (look for "Constraint" or "Rule" headings)
      const constraintMatches = content.match(/##\s+(?:Constraint|Rule|Requirement)[^\n]*\n([\s\S]*?)(?=\n##|$)/gi)
      if (constraintMatches) {
        for (const match of constraintMatches) {
          const text = match.replace(/^##\s+[^\n]+\n/, '').trim()
          if (text.length > 10) {
            constraints.push(`${filename}: ${text.slice(0, 200)}`) // Limit length
          }
        }
      } else {
        // If no constraint section, use filename as constraint identifier
        constraints.push(filename.replace('.mdc', ''))
      }
    }
  }

  return constraints
}

/**
 * Extract conventions from docs/process/*.mdc files.
 * Reads file contents and extracts convention-related content.
 */
async function extractConventions(
  githubToken: string,
  repoFullName: string,
  processFiles: string[],
  defaultBranch: string
): Promise<string[]> {
  const conventions: string[] = []

  for (const filename of processFiles) {
    const result = await fetchFileContents(
      githubToken,
      repoFullName,
      `docs/process/${filename}`,
      500,
      defaultBranch
    )
    if ('content' in result) {
      const content = result.content
      // Extract convention-related sections (look for "Convention" or "Process" headings)
      const conventionMatches = content.match(/##\s+(?:Convention|Process|Workflow)[^\n]*\n([\s\S]*?)(?=\n##|$)/gi)
      if (conventionMatches) {
        for (const match of conventionMatches) {
          const text = match.replace(/^##\s+[^\n]+\n/, '').trim()
          if (text.length > 10) {
            conventions.push(`${filename}: ${text.slice(0, 200)}`) // Limit length
          }
        }
      } else {
        // If no convention section, use filename as convention identifier
        conventions.push(filename.replace('.mdc', ''))
      }
    }
  }

  return conventions
}

/**
 * Generate deterministic checksum for manifest content.
 * Uses SHA-256 hash of sorted JSON representation.
 */
function generateChecksum(
  manifest: IntegrationManifest,
  repoFullName: string,
  defaultBranch: string
): string {
  // Create deterministic JSON representation
  const json = JSON.stringify({
    schemaVersion: 'v0',
    repoFullName,
    defaultBranch,
    goal: manifest.goal,
    stack: manifest.stack, // Already sorted
    constraints: manifest.constraints, // Already sorted
    conventions: manifest.conventions, // Already sorted
  })

  // Generate SHA-256 hash
  const hash = sha256(json)
  return bytesToHex(hash)
}
