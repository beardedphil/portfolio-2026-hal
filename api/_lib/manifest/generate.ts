/**
 * Integration Manifest v0: Deterministic generation
 * 
 * Generates integration manifests from repository sources with deterministic output.
 * Ensures stable ordering and content hashing for versioning.
 */

import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'

export type GithubFileContents = { content: string } | { error: string }

export interface ManifestInputs {
  repoFullName: string
  defaultBranch: string
  schemaVersion: string
  envIdentifiers: Record<string, string>
  repoFiles: {
    readme?: GithubFileContents
    packageJson?: GithubFileContents
    tsconfig?: GithubFileContents
    viteConfig?: GithubFileContents
    cursorRules?: GithubFileContents[]
    docs?: GithubFileContents[]
  }
}

export interface IntegrationManifest {
  schema_version: string
  repo_full_name: string
  default_branch: string
  goal: string
  stack: string[]
  constraints: string[]
  conventions: string[]
  generated_at: string
  env_identifiers: Record<string, string>
}

/**
 * Generates a deterministic integration manifest from repository sources.
 * 
 * Precedence order for goal:
 * 1. README.md first heading or title
 * 2. README.md first paragraph
 * 3. package.json description
 * 4. package.json name
 * 5. Fallback: repo name
 * 
 * Precedence order for stack:
 * 1. package.json dependencies + devDependencies (sorted)
 * 2. TypeScript config presence
 * 3. Vite config presence
 * 
 * Precedence order for constraints:
 * 1. .cursor/rules/*.mdc files (extract constraints sections)
 * 2. docs/process/*.mdc files (extract constraints sections)
 * 
 * Precedence order for conventions:
 * 1. .cursor/rules/*.mdc files (extract conventions sections)
 * 2. docs/process/*.mdc files (extract conventions sections)
 */
export function generateManifest(inputs: ManifestInputs): IntegrationManifest {
  const goal = extractGoal(inputs)
  const stack = extractStack(inputs)
  const constraints = extractConstraints(inputs)
  const conventions = extractConventions(inputs)

  const manifest: IntegrationManifest = {
    schema_version: inputs.schemaVersion,
    repo_full_name: inputs.repoFullName,
    default_branch: inputs.defaultBranch,
    goal,
    stack: stack.sort(), // Ensure deterministic ordering
    constraints: constraints.sort(), // Ensure deterministic ordering
    conventions: conventions.sort(), // Ensure deterministic ordering
    generated_at: new Date().toISOString(),
    env_identifiers: { ...inputs.envIdentifiers }, // Shallow copy
  }

  return manifest
}

/**
 * Computes a deterministic content hash for a manifest.
 * Uses SHA-256 of the canonical JSON representation (sorted keys, no whitespace).
 */
export function computeManifestHash(manifest: IntegrationManifest): string {
  // Create canonical JSON: sorted keys, no whitespace
  const canonical = JSON.stringify(manifest, Object.keys(manifest).sort())
  const hash = sha256(canonical)
  return bytesToHex(hash)
}

/**
 * Extracts goal from repository sources with documented precedence.
 */
function extractGoal(inputs: ManifestInputs): string {
  // 1. README.md first heading or title
  if (inputs.repoFiles.readme && 'content' in inputs.repoFiles.readme) {
    const headingMatch = inputs.repoFiles.readme.content.match(/^#+\s+(.+)$/m)
    if (headingMatch && headingMatch[1]) {
      return headingMatch[1].trim()
    }
    // 2. README.md first paragraph (non-empty line after title)
    const lines = inputs.repoFiles.readme.content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (line && !line.startsWith('#') && line.length > 10) {
        return line
      }
    }
  }

  // 3. package.json description
  if (inputs.repoFiles.packageJson && 'content' in inputs.repoFiles.packageJson) {
    try {
      const pkg = JSON.parse(inputs.repoFiles.packageJson.content)
      if (typeof pkg.description === 'string' && pkg.description.trim()) {
        return pkg.description.trim()
      }
      // 4. package.json name
      if (typeof pkg.name === 'string' && pkg.name.trim()) {
        return pkg.name.trim()
      }
    } catch {
      // Invalid JSON, continue
    }
  }

  // 5. Fallback: repo name
  const repoName = inputs.repoFullName.split('/').pop() || inputs.repoFullName
  return repoName
}

/**
 * Extracts stack from repository sources with documented precedence.
 */
function extractStack(inputs: ManifestInputs): string[] {
  const stack: string[] = []

  // 1. package.json dependencies + devDependencies (sorted)
  if (inputs.repoFiles.packageJson && 'content' in inputs.repoFiles.packageJson) {
    try {
      const pkg = JSON.parse(inputs.repoFiles.packageJson.content)
      const deps = { ...pkg.dependencies, ...pkg.devDependencies }
      const depNames = Object.keys(deps).sort()
      stack.push(...depNames)
    } catch {
      // Invalid JSON, continue
    }
  }

  // 2. TypeScript config presence
  if (inputs.repoFiles.tsconfig && 'content' in inputs.repoFiles.tsconfig) {
    stack.push('typescript')
  }

  // 3. Vite config presence
  if (inputs.repoFiles.viteConfig && 'content' in inputs.repoFiles.viteConfig) {
    stack.push('vite')
  }

  return [...new Set(stack)] // Remove duplicates
}

/**
 * Extracts constraints from repository sources with documented precedence.
 */
function extractConstraints(inputs: ManifestInputs): string[] {
  const constraints: string[] = []

  // Extract from .cursor/rules/*.mdc and docs/process/*.mdc files
  const ruleFiles = [
    ...(inputs.repoFiles.cursorRules || []),
    ...(inputs.repoFiles.docs || []),
  ]

  for (const file of ruleFiles) {
    if ('content' in file) {
      // Look for "## Constraints" section
      const constraintsMatch = file.content.match(/##\s+Constraints\s*\n([\s\S]*?)(?=\n##|\n#|$)/i)
      if (constraintsMatch && constraintsMatch[1]) {
        const lines = constraintsMatch[1]
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith('#'))
        constraints.push(...lines)
      }
    }
  }

  return constraints
}

/**
 * Extracts conventions from repository sources with documented precedence.
 */
function extractConventions(inputs: ManifestInputs): string[] {
  const conventions: string[] = []

  // Extract from .cursor/rules/*.mdc and docs/process/*.mdc files
  const ruleFiles = [
    ...(inputs.repoFiles.cursorRules || []),
    ...(inputs.repoFiles.docs || []),
  ]

  for (const file of ruleFiles) {
    if ('content' in file) {
      // Look for "## Conventions" or "## Non-goals" sections
      const conventionsMatch = file.content.match(/##\s+(Conventions|Non-goals)\s*\n([\s\S]*?)(?=\n##|\n#|$)/i)
      if (conventionsMatch && conventionsMatch[2]) {
        const lines = conventionsMatch[2]
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith('#'))
        conventions.push(...lines)
      }
    }
  }

  return conventions
}
