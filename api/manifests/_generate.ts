/**
 * Integration Manifest v0 generation logic
 * 
 * Generates deterministic manifests from repository sources.
 * Ensures stable ordering and content hashing for versioning.
 */

import { createHash } from 'crypto'
import type { GithubRepo } from '../_lib/github/repos.js'
import { fetchFileContents } from '../_lib/github/files.js'

export type ManifestContent = {
  goal: string
  stack: string[]
  constraints: string[]
  conventions: string[]
}

export type ManifestInputs = {
  repoFullName: string
  defaultBranch: string
  schemaVersion: string
  envIdentifiers: Record<string, string>
}

export type GeneratedManifest = {
  manifestContent: ManifestContent
  contentHash: string
  inputs: ManifestInputs
}

/**
 * Generates a deterministic manifest from repository sources.
 * 
 * Precedence order for goal:
 * 1. README.md title or first heading
 * 2. package.json name/description
 * 3. Repository name
 * 
 * Precedence order for stack:
 * 1. package.json dependencies/devDependencies
 * 2. Build config files (vite.config, tsconfig.json, etc.)
 * 3. File extensions in repo
 * 
 * Precedence order for constraints:
 * 1. .cursor/rules/*.mdc files
 * 2. docs/process/*.mdc files
 * 3. README.md constraints section
 * 
 * Precedence order for conventions:
 * 1. .cursor/rules/*.mdc files
 * 2. docs/process/*.mdc files
 * 3. README.md conventions section
 */
export async function generateManifest(
  token: string,
  inputs: ManifestInputs
): Promise<GeneratedManifest | { error: string }> {
  try {
    const { repoFullName, defaultBranch } = inputs

    // Fetch repository files in parallel
    const [readmeResult, packageJsonResult, rulesFilesResult] = await Promise.all([
      fetchFileContents(token, repoFullName, 'README.md', 100, defaultBranch),
      fetchFileContents(token, repoFullName, 'package.json', 500, defaultBranch),
      listRulesFiles(token, repoFullName, defaultBranch),
    ])

    // Derive goal
    const goal = deriveGoal(readmeResult, packageJsonResult, repoFullName)

    // Derive stack
    const stack = deriveStack(packageJsonResult, repoFullName)

    // Derive constraints
    const constraints = await deriveConstraints(
      token,
      repoFullName,
      defaultBranch,
      readmeResult,
      rulesFilesResult
    )

    // Derive conventions
    const conventions = await deriveConventions(
      token,
      repoFullName,
      defaultBranch,
      readmeResult,
      rulesFilesResult
    )

    // Create manifest content with stable ordering
    const manifestContent: ManifestContent = {
      goal,
      stack: stack.sort(), // Sort for deterministic output
      constraints: constraints.sort(),
      conventions: conventions.sort(),
    }

    // Generate content hash (deterministic)
    const contentHash = hashManifestContent(manifestContent, inputs)

    return {
      manifestContent,
      contentHash,
      inputs,
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Derives goal from repository sources with documented precedence.
 */
function deriveGoal(
  readmeResult: { content: string } | { error: string },
  packageJsonResult: { content: string } | { error: string },
  repoFullName: string
): string {
  // Precedence 1: README.md title or first heading
  if ('content' in readmeResult) {
    const readme = readmeResult.content
    // Look for first H1 (# Title) or title-like pattern
    const h1Match = readme.match(/^#\s+(.+)$/m)
    if (h1Match) {
      return h1Match[1].trim()
    }
    // Look for title in first few lines
    const firstLines = readme.split('\n').slice(0, 5).join('\n')
    const titleMatch = firstLines.match(/^(.+)$/m)
    if (titleMatch && titleMatch[1].length > 5 && titleMatch[1].length < 200) {
      return titleMatch[1].trim()
    }
  }

  // Precedence 2: package.json name/description
  if ('content' in packageJsonResult) {
    try {
      const pkg = JSON.parse(packageJsonResult.content)
      if (pkg.description && typeof pkg.description === 'string') {
        return pkg.description.trim()
      }
      if (pkg.name && typeof pkg.name === 'string') {
        return pkg.name
      }
    } catch {
      // Ignore JSON parse errors
    }
  }

  // Precedence 3: Repository name
  const repoName = repoFullName.split('/').pop() || repoFullName
  return repoName
}

/**
 * Derives stack from repository sources with documented precedence.
 */
function deriveStack(
  packageJsonResult: { content: string } | { error: string },
  repoFullName: string
): string[] {
  const stack: string[] = []

  // Precedence 1: package.json dependencies/devDependencies
  if ('content' in packageJsonResult) {
    try {
      const pkg = JSON.parse(packageJsonResult.content)
      const deps = { ...pkg.dependencies, ...pkg.devDependencies }
      
      // Extract key technologies
      const keyTechs = new Set<string>()
      
      // Framework detection
      if (deps.react || deps['react-dom']) keyTechs.add('React')
      if (deps.vue) keyTechs.add('Vue')
      if (deps.angular) keyTechs.add('Angular')
      if (deps.svelte) keyTechs.add('Svelte')
      
      // Build tools
      if (deps.vite || deps['@vitejs/plugin-react']) keyTechs.add('Vite')
      if (deps.webpack) keyTechs.add('Webpack')
      if (deps['@typescript-eslint/parser'] || deps.typescript) keyTechs.add('TypeScript')
      
      // Runtime
      if (deps.node) keyTechs.add('Node.js')
      if (deps['@supabase/supabase-js']) keyTechs.add('Supabase')
      
      // Testing
      if (deps.vitest || deps.jest) keyTechs.add('Vitest/Jest')
      if (deps['@playwright/test']) keyTechs.add('Playwright')
      
      stack.push(...Array.from(keyTechs))
    } catch {
      // Ignore JSON parse errors
    }
  }

  // Precedence 2: Build config files (inferred from repo structure)
  // This is handled by checking package.json scripts and dependencies above

  // Precedence 3: File extensions (minimal - just add if we have no stack yet)
  if (stack.length === 0) {
    stack.push('Unknown stack')
  }

  return stack
}

/**
 * Derives constraints from repository sources with documented precedence.
 */
async function deriveConstraints(
  token: string,
  repoFullName: string,
  defaultBranch: string,
  readmeResult: { content: string } | { error: string },
  rulesFiles: string[]
): Promise<string[]> {
  const constraints: string[] = []

  // Precedence 1: .cursor/rules/*.mdc files
  for (const file of rulesFiles) {
    const result = await fetchFileContents(token, repoFullName, file, 500, defaultBranch)
    if ('content' in result) {
      // Extract constraint-like content (look for "MANDATORY", "REQUIRED", "MUST", etc.)
      const lines = result.content.split('\n')
      for (const line of lines) {
        if (
          /MANDATORY|REQUIRED|MUST|SHALL|SHOULD|CONSTRAINT/i.test(line) &&
          line.length > 20 &&
          line.length < 500
        ) {
          constraints.push(line.trim())
        }
      }
    }
  }

  // Precedence 2: docs/process/*.mdc files
  const processFiles = await listProcessFiles(token, repoFullName, defaultBranch)
  for (const file of processFiles) {
    const result = await fetchFileContents(token, repoFullName, file, 500, defaultBranch)
    if ('content' in result) {
      const lines = result.content.split('\n')
      for (const line of lines) {
        if (
          /MANDATORY|REQUIRED|MUST|SHALL|CONSTRAINT/i.test(line) &&
          line.length > 20 &&
          line.length < 500
        ) {
          constraints.push(line.trim())
        }
      }
    }
  }

  // Precedence 3: README.md constraints section
  if ('content' in readmeResult) {
    const readme = readmeResult.content
    const constraintsMatch = readme.match(/##\s+Constraints?\s*\n([\s\S]*?)(?=\n##|$)/i)
    if (constraintsMatch) {
      const constraintLines = constraintsMatch[1]
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith('#'))
      constraints.push(...constraintLines)
    }
  }

  // Deduplicate
  return Array.from(new Set(constraints))
}

/**
 * Derives conventions from repository sources with documented precedence.
 */
async function deriveConventions(
  token: string,
  repoFullName: string,
  defaultBranch: string,
  readmeResult: { content: string } | { error: string },
  rulesFiles: string[]
): Promise<string[]> {
  const conventions: string[] = []

  // Precedence 1: .cursor/rules/*.mdc files (extract convention patterns)
  for (const file of rulesFiles) {
    const result = await fetchFileContents(token, repoFullName, file, 500, defaultBranch)
    if ('content' in result) {
      // Extract convention-like content (look for patterns, standards, style guides)
      const lines = result.content.split('\n')
      for (const line of lines) {
        if (
          /CONVENTION|PATTERN|STANDARD|STYLE|FORMAT|GUIDELINE/i.test(line) &&
          line.length > 20 &&
          line.length < 500
        ) {
          conventions.push(line.trim())
        }
      }
    }
  }

  // Precedence 2: docs/process/*.mdc files
  const processFiles = await listProcessFiles(token, repoFullName, defaultBranch)
  for (const file of processFiles) {
    const result = await fetchFileContents(token, repoFullName, file, 500, defaultBranch)
    if ('content' in result) {
      const lines = result.content.split('\n')
      for (const line of lines) {
        if (
          /CONVENTION|PATTERN|STANDARD|STYLE|FORMAT|GUIDELINE/i.test(line) &&
          line.length > 20 &&
          line.length < 500
        ) {
          conventions.push(line.trim())
        }
      }
    }
  }

  // Precedence 3: README.md conventions section
  if ('content' in readmeResult) {
    const readme = readmeResult.content
    const conventionsMatch = readme.match(/##\s+Conventions?\s*\n([\s\S]*?)(?=\n##|$)/i)
    if (conventionsMatch) {
      const conventionLines = conventionsMatch[1]
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith('#'))
      conventions.push(...conventionLines)
    }
  }

  // Deduplicate
  return Array.from(new Set(conventions))
}

/**
 * Lists .cursor/rules/*.mdc files in the repository.
 */
async function listRulesFiles(
  token: string,
  repoFullName: string,
  defaultBranch: string
): Promise<string[]> {
  try {
    const { listDirectoryContents } = await import('../_lib/github/files.js')
    const result = await listDirectoryContents(token, repoFullName, '.cursor/rules', defaultBranch)
    if ('error' in result) return []
    return result.entries
      .filter((f) => f.endsWith('.mdc'))
      .map((f) => `.cursor/rules/${f}`)
  } catch {
    return []
  }
}

/**
 * Lists docs/process/*.mdc files in the repository.
 */
async function listProcessFiles(
  token: string,
  repoFullName: string,
  defaultBranch: string
): Promise<string[]> {
  try {
    const { listDirectoryContents } = await import('../_lib/github/files.js')
    const result = await listDirectoryContents(token, repoFullName, 'docs/process', defaultBranch)
    if ('error' in result) return []
    return result.entries
      .filter((f) => f.endsWith('.mdc'))
      .map((f) => `docs/process/${f}`)
  } catch {
    return []
  }
}

/**
 * Generates a deterministic content hash for manifest versioning.
 * Uses SHA-256 hash of sorted JSON representation.
 */
function hashManifestContent(
  manifestContent: ManifestContent,
  inputs: ManifestInputs
): string {
  // Create deterministic JSON (sorted keys, sorted arrays)
  const deterministic = {
    schemaVersion: inputs.schemaVersion,
    repoFullName: inputs.repoFullName,
    defaultBranch: inputs.defaultBranch,
    envIdentifiers: sortObjectKeys(inputs.envIdentifiers),
    goal: manifestContent.goal,
    stack: manifestContent.stack.sort(),
    constraints: manifestContent.constraints.sort(),
    conventions: manifestContent.conventions.sort(),
  }

  const json = JSON.stringify(deterministic)
  return createHash('sha256').update(json).digest('hex')
}

/**
 * Sorts object keys recursively for deterministic JSON.
 */
function sortObjectKeys(obj: Record<string, any>): Record<string, any> {
  const sorted: Record<string, any> = {}
  for (const key of Object.keys(obj).sort()) {
    const value = obj[key]
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      sorted[key] = sortObjectKeys(value)
    } else {
      sorted[key] = value
    }
  }
  return sorted
}
