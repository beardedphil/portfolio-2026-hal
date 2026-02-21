/**
 * Integration Manifest v0 Generation
 * 
 * Generates deterministic manifests from repo sources with stable versioning.
 */

import { createHash } from 'crypto'
import { fetchFileContents } from '../github/files.js'
import type { IntegrationManifestV0 } from './types.js'

/**
 * Generates a deterministic checksum for a manifest JSON object.
 * Uses canonical JSON serialization to ensure the same logical JSON produces the same checksum.
 */
export function generateManifestChecksum(manifest: IntegrationManifestV0): string {
  const canonical = canonicalizeJson(manifest)
  return createHash('sha256').update(canonical, 'utf8').digest('hex')
}

/**
 * Recursively canonicalizes a JSON value to ensure deterministic serialization.
 */
function canonicalizeJson(value: unknown): string {
  if (value === null) {
    return 'null'
  }
  
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }
  
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'null'
    if (!Number.isFinite(value)) return 'null'
    return String(value)
  }
  
  if (typeof value === 'string') {
    return JSON.stringify(value)
  }
  
  if (Array.isArray(value)) {
    const items = value.map(item => canonicalizeJson(item))
    return `[${items.join(',')}]`
  }
  
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort()
    const pairs = keys.map(key => {
      const val = (value as Record<string, unknown>)[key]
      return `${JSON.stringify(key)}:${canonicalizeJson(val)}`
    })
    return `{${pairs.join(',')}}`
  }
  
  return JSON.stringify(value)
}

/**
 * Generates an Integration Manifest v0 from repo sources.
 * 
 * @param token - GitHub token for API access
 * @param repoFullName - Repository full name (owner/repo)
 * @param defaultBranch - Default branch name (e.g., 'main')
 * @param envIdentifiers - Known environment identifiers (optional)
 * @param projectId - Project identifier (optional, defaults to repo name)
 * @returns Generated manifest or error
 */
export async function generateManifest(
  token: string,
  repoFullName: string,
  defaultBranch: string,
  envIdentifiers: Record<string, string> = {},
  projectId?: string
): Promise<{ manifest: IntegrationManifestV0 } | { error: string }> {
  try {
    // Derive goal from deterministic sources (precedence order)
    const goal = await deriveGoal(token, repoFullName, defaultBranch)
    
    // Derive stack from deterministic sources (precedence order)
    const stack = await deriveStack(token, repoFullName, defaultBranch)
    
    // Derive constraints from deterministic sources (precedence order)
    const constraints = await deriveConstraints(token, repoFullName, defaultBranch)
    
    // Derive conventions from deterministic sources (precedence order)
    const conventions = await deriveConventions(token, repoFullName, defaultBranch)
    
    // Derive project_id from envIdentifiers or default to repo name
    const derivedProjectId = projectId || envIdentifiers.project_id || repoFullName.split('/').pop() || repoFullName
    
    const manifest: IntegrationManifestV0 = {
      schema_version: 'v0',
      repo_full_name: repoFullName,
      default_branch: defaultBranch,
      project_id: derivedProjectId,
      env_identifiers: sortObjectKeys(envIdentifiers), // Ensure stable ordering
      project_manifest: {
        goal,
        stack: sortObjectKeys(stack), // Ensure stable ordering
        constraints: sortObjectKeys(constraints), // Ensure stable ordering
        conventions: sortObjectKeys(conventions), // Ensure stable ordering
      },
      generated_at: new Date().toISOString(),
    }
    
    return { manifest }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Derives goal from repo sources with documented precedence:
 * 1. README.md title or first heading
 * 2. package.json description
 * 3. package.json name
 * 4. Default: repo name
 */
async function deriveGoal(
  token: string,
  repoFullName: string,
  defaultBranch: string
): Promise<string> {
  // Try README.md first
  const readmeResult = await fetchFileContents(token, repoFullName, 'README.md', 100, defaultBranch)
  if (!('error' in readmeResult)) {
    const readme = readmeResult.content
    // Extract title from first # heading or first line
    const titleMatch = readme.match(/^#\s+(.+)$/m)
    if (titleMatch) {
      return titleMatch[1].trim()
    }
    // Fallback to first non-empty line
    const firstLine = readme.split('\n').find(line => line.trim().length > 0)
    if (firstLine && firstLine.trim().length > 0) {
      return firstLine.trim().replace(/^#+\s*/, '')
    }
  }
  
  // Try package.json description
  const packageResult = await fetchFileContents(token, repoFullName, 'package.json', 50, defaultBranch)
  if (!('error' in packageResult)) {
    try {
      const pkg = JSON.parse(packageResult.content)
      if (pkg.description && typeof pkg.description === 'string') {
        return pkg.description
      }
      if (pkg.name && typeof pkg.name === 'string') {
        return pkg.name
      }
    } catch {
      // Ignore JSON parse errors
    }
  }
  
  // Default to repo name
  const repoName = repoFullName.split('/').pop() || repoFullName
  return repoName
}

/**
 * Derives stack from repo sources with documented precedence:
 * 1. package.json dependencies and devDependencies
 * 2. Build config files (vite.config, tsconfig.json, etc.)
 * 3. Runtime environment indicators
 */
async function deriveStack(
  token: string,
  repoFullName: string,
  defaultBranch: string
): Promise<Record<string, string[]>> {
  const stack: Record<string, string[]> = {
    languages: [],
    frameworks: [],
    build_tools: [],
    databases: [],
    other: [],
  }
  
  // Read package.json for dependencies
  const packageResult = await fetchFileContents(token, repoFullName, 'package.json', 200, defaultBranch)
  if (!('error' in packageResult)) {
    try {
      const pkg = JSON.parse(packageResult.content)
      
      // Extract languages from dependencies
      if (pkg.dependencies || pkg.devDependencies) {
        const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }
        const depNames = Object.keys(allDeps)
        
        // Detect TypeScript
        if (depNames.includes('typescript') || depNames.some(d => d.includes('typescript'))) {
          stack.languages.push('TypeScript')
        }
        // Detect JavaScript (if no TypeScript)
        else if (depNames.length > 0) {
          stack.languages.push('JavaScript')
        }
        
        // Detect frameworks
        if (depNames.includes('react')) {
          stack.frameworks.push('React')
        }
        if (depNames.includes('vue')) {
          stack.frameworks.push('Vue')
        }
        if (depNames.some(d => d.includes('angular'))) {
          stack.frameworks.push('Angular')
        }
        
        // Detect build tools
        if (depNames.includes('vite')) {
          stack.build_tools.push('Vite')
        }
        if (depNames.includes('webpack')) {
          stack.build_tools.push('Webpack')
        }
        if (depNames.some(d => d.includes('rollup'))) {
          stack.build_tools.push('Rollup')
        }
        
        // Detect databases
        if (depNames.some(d => d.includes('supabase'))) {
          stack.databases.push('Supabase')
        }
        if (depNames.some(d => d.includes('postgres'))) {
          stack.databases.push('PostgreSQL')
        }
        if (depNames.some(d => d.includes('mongodb'))) {
          stack.databases.push('MongoDB')
        }
      }
    } catch {
      // Ignore JSON parse errors
    }
  }
  
  // Check for build config files
  const viteResult = await fetchFileContents(token, repoFullName, 'vite.config.ts', 10, defaultBranch)
  if (!('error' in viteResult)) {
    if (!stack.build_tools.includes('Vite')) {
      stack.build_tools.push('Vite')
    }
  }
  
  const tsconfigResult = await fetchFileContents(token, repoFullName, 'tsconfig.json', 10, defaultBranch)
  if (!('error' in tsconfigResult)) {
    if (!stack.languages.includes('TypeScript')) {
      stack.languages.push('TypeScript')
    }
  }
  
  // Remove empty arrays and sort all arrays for stability
  const cleaned: Record<string, string[]> = {}
  for (const [key, value] of Object.entries(stack)) {
    if (value.length > 0) {
      cleaned[key] = value.sort()
    }
  }
  
  return cleaned
}

/**
 * Derives constraints from repo sources with documented precedence:
 * 1. .cursor/rules/*.mdc files
 * 2. docs/process/*.mdc files
 * 3. README.md constraints section
 */
async function deriveConstraints(
  token: string,
  repoFullName: string,
  defaultBranch: string
): Promise<Record<string, string>> {
  const constraints: Record<string, string> = {}
  
  // Try to read .cursor/rules directory (would need listDirectoryContents, but for now check common files)
  const rulesFiles = [
    '.cursor/rules/agent-instructions.mdc',
    'docs/process/hal-tool-call-contract.mdc',
  ]
  
  for (const file of rulesFiles) {
    const result = await fetchFileContents(token, repoFullName, file, 50, defaultBranch)
    if (!('error' in result)) {
      // Extract constraint-like content (simplified - could be more sophisticated)
      const content = result.content
      if (content.includes('MANDATORY') || content.includes('REQUIRED')) {
        constraints[file] = 'Process rules and constraints documented'
      }
    }
  }
  
  // Check README for constraints section
  const readmeResult = await fetchFileContents(token, repoFullName, 'README.md', 200, defaultBranch)
  if (!('error' in readmeResult)) {
    const readme = readmeResult.content
    if (readme.includes('## Constraints') || readme.includes('### Constraints')) {
      constraints['README.md'] = 'Constraints documented in README'
    }
  }
  
  return constraints
}

/**
 * Derives conventions from repo sources with documented precedence:
 * 1. .cursor/rules/*.mdc files (coding conventions)
 * 2. Linter config files (.eslintrc, .prettierrc, etc.)
 * 3. TypeScript config conventions
 */
async function deriveConventions(
  token: string,
  repoFullName: string,
  defaultBranch: string
): Promise<Record<string, string>> {
  const conventions: Record<string, string> = {}
  
  // Check for linter configs
  const eslintResult = await fetchFileContents(token, repoFullName, '.eslintrc.json', 20, defaultBranch)
  if (!('error' in eslintResult)) {
    conventions['.eslintrc.json'] = 'ESLint configuration present'
  }
  
  const prettierResult = await fetchFileContents(token, repoFullName, '.prettierrc', 20, defaultBranch)
  if (!('error' in prettierResult)) {
    conventions['.prettierrc'] = 'Prettier configuration present'
  }
  
  // Check TypeScript config for strictness
  const tsconfigResult = await fetchFileContents(token, repoFullName, 'tsconfig.json', 50, defaultBranch)
  if (!('error' in tsconfigResult)) {
    try {
      const tsconfig = JSON.parse(tsconfigResult.content)
      if (tsconfig.compilerOptions?.strict) {
        conventions['tsconfig.json'] = 'TypeScript strict mode enabled'
      }
    } catch {
      // Ignore parse errors
    }
  }
  
  // Check for .cursor/rules for coding conventions
  const rulesResult = await fetchFileContents(token, repoFullName, '.cursor/rules/code-citation-requirements.mdc', 20, defaultBranch)
  if (!('error' in rulesResult)) {
    conventions['.cursor/rules'] = 'Code citation conventions documented'
  }
  
  return conventions
}

/**
 * Sorts object keys recursively to ensure stable ordering.
 */
function sortObjectKeys<T extends Record<string, unknown>>(obj: T): T {
  const sorted: Record<string, unknown> = {}
  const keys = Object.keys(obj).sort()
  for (const key of keys) {
    const value = obj[key]
    if (value && typeof value === 'object' && !Array.isArray(value) && value.constructor === Object) {
      sorted[key] = sortObjectKeys(value as Record<string, unknown>)
    } else {
      sorted[key] = value
    }
  }
  return sorted as T
}
