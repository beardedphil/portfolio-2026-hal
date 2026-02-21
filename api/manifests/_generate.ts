/**
 * Integration Manifest v0 generation
 * 
 * Deterministic manifest generation from repo sources with documented precedence order.
 * 
 * Field derivation precedence:
 * 
 * **goal:**
 * 1. README.md title (first H1 or title in frontmatter)
 * 2. README.md first paragraph (if no title)
 * 3. package.json description
 * 4. package.json name (as fallback)
 * 
 * **stack:**
 * 1. package.json dependencies (extract key packages)
 * 2. package.json devDependencies (extract key packages)
 * 3. Build config files (vite.config.*, webpack.config.*, tsconfig.json presence)
 * 
 * **constraints:**
 * 1. .cursor/rules/*.mdc files (extract "Constraints" sections)
 * 2. docs/process/*.mdc files (extract "Constraints" sections)
 * 3. README.md (extract "Constraints" section if present)
 * 
 * **conventions:**
 * 1. .cursor/rules/*.mdc files (extract content, excluding secrets)
 * 2. docs/process/*.mdc files (extract content, excluding secrets)
 * 3. README.md (extract "Conventions" or "Process" sections if present)
 */

import { fetchFileContents, listDirectoryContents } from '../_lib/github/files.js'
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'

export type IntegrationManifest = {
  goal: string
  stack: string[]
  constraints: string[]
  conventions: string[]
}

export type ManifestGenerationInputs = {
  repoFullName: string
  defaultBranch: string
  schemaVersion: string
  envIdentifiers: Record<string, string>
}

export type ManifestGenerationResult = {
  manifest: IntegrationManifest
  contentHash: string
  inputs: ManifestGenerationInputs
}

/**
 * Generate a deterministic content hash from manifest content.
 * Uses sorted JSON representation to ensure stable hashing.
 */
function generateContentHash(manifest: IntegrationManifest, inputs: ManifestGenerationInputs): string {
  // Create a stable, sorted representation
  const stable = {
    schemaVersion: inputs.schemaVersion,
    goal: manifest.goal.trim(),
    stack: [...manifest.stack].sort(),
    constraints: [...manifest.constraints].sort(),
    conventions: [...manifest.conventions].sort(),
  }
  const json = JSON.stringify(stable, null, 0)
  const hash = sha256(new TextEncoder().encode(json))
  return bytesToHex(hash)
}

/**
 * Extract goal from README.md with precedence order.
 */
async function extractGoalFromReadme(
  token: string,
  repoFullName: string,
  defaultBranch: string
): Promise<string | null> {
  const readmeResult = await fetchFileContents(token, repoFullName, 'README.md', 100, defaultBranch)
  if ('error' in readmeResult) {
    return null
  }

  const content = readmeResult.content
  // Try to extract title from frontmatter
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/)
  if (frontmatterMatch) {
    const frontmatter = frontmatterMatch[1]
    const titleMatch = frontmatter.match(/^title:\s*(.+)$/m)
    if (titleMatch) {
      return titleMatch[1].trim().replace(/^["']|["']$/g, '')
    }
  }

  // Try to extract first H1
  const h1Match = content.match(/^#\s+(.+)$/m)
  if (h1Match) {
    return h1Match[1].trim()
  }

  // Extract first paragraph (non-empty line after frontmatter/header)
  const lines = content.split('\n')
  let startIdx = 0
  if (frontmatterMatch) {
    startIdx = content.indexOf('---', frontmatterMatch[0].length) + 3
  }
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line && !line.startsWith('#') && line.length > 10) {
      // Return first substantial paragraph
      return line.substring(0, 200).trim()
    }
  }

  return null
}

/**
 * Extract goal from package.json.
 */
async function extractGoalFromPackageJson(
  token: string,
  repoFullName: string,
  defaultBranch: string
): Promise<string | null> {
  const pkgResult = await fetchFileContents(token, repoFullName, 'package.json', 50, defaultBranch)
  if ('error' in pkgResult) {
    return null
  }

  try {
    const pkg = JSON.parse(pkgResult.content)
    if (pkg.description) {
      return pkg.description.trim()
    }
    if (pkg.name) {
      return pkg.name.trim()
    }
  } catch {
    // Invalid JSON, ignore
  }

  return null
}

/**
 * Extract stack from package.json dependencies.
 */
async function extractStackFromPackageJson(
  token: string,
  repoFullName: string,
  defaultBranch: string
): Promise<string[]> {
  const pkgResult = await fetchFileContents(token, repoFullName, 'package.json', 200, defaultBranch)
  if ('error' in pkgResult) {
    return []
  }

  const stack: string[] = []
  try {
    const pkg = JSON.parse(pkgResult.content)
    
    // Extract key dependencies (frameworks, libraries, not utilities)
    const keyDeps = [
      'react', 'vue', 'angular', 'svelte',
      'next', 'nuxt', 'remix', 'sveltekit',
      'express', 'fastify', 'koa', 'hapi',
      'typescript', 'javascript',
      'vite', 'webpack', 'rollup', 'esbuild',
      'supabase', 'firebase', 'prisma', 'drizzle',
      'tailwindcss', 'bootstrap', 'material-ui',
    ]
    
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }
    for (const [dep, _version] of Object.entries(deps)) {
      if (keyDeps.some(key => dep.toLowerCase().includes(key.toLowerCase()))) {
        stack.push(dep)
      }
    }
    
    // Also check for build tools in devDependencies
    if (pkg.devDependencies) {
      for (const [dep, _version] of Object.entries(pkg.devDependencies)) {
        if (['vite', 'webpack', 'rollup', 'esbuild', 'tsc', 'typescript'].some(tool => 
          dep.toLowerCase().includes(tool.toLowerCase())
        )) {
          if (!stack.includes(dep)) {
            stack.push(dep)
          }
        }
      }
    }
  } catch {
    // Invalid JSON, ignore
  }

  return [...new Set(stack)].sort()
}

/**
 * Extract constraints from markdown files.
 */
async function extractConstraints(
  token: string,
  repoFullName: string,
  defaultBranch: string
): Promise<string[]> {
  const constraints: string[] = []

  // Check .cursor/rules/*.mdc files
  try {
    const rulesList = await listDirectoryContents(token, repoFullName, '.cursor/rules', defaultBranch)
    if (!('error' in rulesList)) {
      for (const file of rulesList.entries) {
        if (file.endsWith('.mdc')) {
          const fileResult = await fetchFileContents(token, repoFullName, `.cursor/rules/${file}`, 500, defaultBranch)
          if (!('error' in fileResult)) {
            const constraintsMatch = fileResult.content.match(/##\s+Constraints?\s*\n([\s\S]*?)(?=\n##|\n#|$)/i)
            if (constraintsMatch) {
              const constraintText = constraintsMatch[1].trim()
              // Extract bullet points or paragraphs
              const bullets = constraintText.split(/\n[-*]\s+/).filter(b => b.trim().length > 10)
              constraints.push(...bullets.map(b => b.trim().substring(0, 200)))
            }
          }
        }
      }
    }
  } catch {
    // Ignore errors
  }

  // Check docs/process/*.mdc files
  try {
    const processList = await listDirectoryContents(token, repoFullName, 'docs/process', defaultBranch)
    if (!('error' in processList)) {
      for (const file of processList.entries) {
        if (file.endsWith('.mdc')) {
          const fileResult = await fetchFileContents(token, repoFullName, `docs/process/${file}`, 500, defaultBranch)
          if (!('error' in fileResult)) {
            const constraintsMatch = fileResult.content.match(/##\s+Constraints?\s*\n([\s\S]*?)(?=\n##|\n#|$)/i)
            if (constraintsMatch) {
              const constraintText = constraintsMatch[1].trim()
              const bullets = constraintText.split(/\n[-*]\s+/).filter(b => b.trim().length > 10)
              constraints.push(...bullets.map(b => b.trim().substring(0, 200)))
            }
          }
        }
      }
    }
  } catch {
    // Ignore errors
  }

  // Check README.md for constraints section
  try {
    const readmeResult = await fetchFileContents(token, repoFullName, 'README.md', 500, defaultBranch)
    if (!('error' in readmeResult)) {
      const constraintsMatch = readmeResult.content.match(/##\s+Constraints?\s*\n([\s\S]*?)(?=\n##|\n#|$)/i)
      if (constraintsMatch) {
        const constraintText = constraintsMatch[1].trim()
        const bullets = constraintText.split(/\n[-*]\s+/).filter(b => b.trim().length > 10)
        constraints.push(...bullets.map(b => b.trim().substring(0, 200)))
      }
    }
  } catch {
    // Ignore errors
  }

  return [...new Set(constraints)].filter(c => c.length > 0).sort()
}

/**
 * Extract conventions from markdown files (excluding secrets).
 */
async function extractConventions(
  token: string,
  repoFullName: string,
  defaultBranch: string
): Promise<string[]> {
  const conventions: string[] = []

  // Check .cursor/rules/*.mdc files
  try {
    const rulesList = await listDirectoryContents(token, repoFullName, '.cursor/rules', defaultBranch)
    if (!('error' in rulesList)) {
      for (const file of rulesList.entries) {
        if (file.endsWith('.mdc')) {
          const fileResult = await fetchFileContents(token, repoFullName, `.cursor/rules/${file}`, 1000, defaultBranch)
          if (!('error' in fileResult)) {
            let content = fileResult.content
            // Remove secrets (API keys, tokens, passwords)
            content = content.replace(/\b(api[_-]?key|token|password|secret|credential)\s*[:=]\s*['"]?[a-zA-Z0-9_\-]{20,}['"]?/gi, '[REDACTED]')
            // Extract meaningful content (skip frontmatter, extract main content)
            const frontmatterMatch = content.match(/^---\s*\n[\s\S]*?\n---\s*\n/)
            if (frontmatterMatch) {
              content = content.substring(frontmatterMatch[0].length)
            }
            // Take first 500 chars as convention summary
            const summary = content.trim().substring(0, 500)
            if (summary.length > 50) {
              conventions.push(`${file}: ${summary}`)
            }
          }
        }
      }
    }
  } catch {
    // Ignore errors
  }

  // Check docs/process/*.mdc files
  try {
    const processList = await listDirectoryContents(token, repoFullName, 'docs/process', defaultBranch)
    if (!('error' in processList)) {
      for (const file of processList.entries) {
        if (file.endsWith('.mdc')) {
          const fileResult = await fetchFileContents(token, repoFullName, `docs/process/${file}`, 1000, defaultBranch)
          if (!('error' in fileResult)) {
            let content = fileResult.content
            // Remove secrets
            content = content.replace(/\b(api[_-]?key|token|password|secret|credential)\s*[:=]\s*['"]?[a-zA-Z0-9_\-]{20,}['"]?/gi, '[REDACTED]')
            const frontmatterMatch = content.match(/^---\s*\n[\s\S]*?\n---\s*\n/)
            if (frontmatterMatch) {
              content = content.substring(frontmatterMatch[0].length)
            }
            const summary = content.trim().substring(0, 500)
            if (summary.length > 50) {
              conventions.push(`${file}: ${summary}`)
            }
          }
        }
      }
    }
  } catch {
    // Ignore errors
  }

  // Check README.md for conventions/process sections
  try {
    const readmeResult = await fetchFileContents(token, repoFullName, 'README.md', 1000, defaultBranch)
    if (!('error' in readmeResult)) {
      const conventionsMatch = readmeResult.content.match(/##\s+(Conventions?|Process)\s*\n([\s\S]*?)(?=\n##|\n#|$)/i)
      if (conventionsMatch) {
        let content = conventionsMatch[2].trim()
        content = content.replace(/\b(api[_-]?key|token|password|secret|credential)\s*[:=]\s*['"]?[a-zA-Z0-9_\-]{20,}['"]?/gi, '[REDACTED]')
        const summary = content.substring(0, 500)
        if (summary.length > 50) {
          conventions.push(`README.md: ${summary}`)
        }
      }
    }
  } catch {
    // Ignore errors
  }

  return [...new Set(conventions)].filter(c => c.length > 0).sort()
}

/**
 * Generate Integration Manifest v0 from repo sources.
 */
export async function generateIntegrationManifest(
  token: string,
  inputs: ManifestGenerationInputs
): Promise<ManifestGenerationResult> {
  const { repoFullName, defaultBranch } = inputs

  // Extract goal with precedence order
  let goal = ''
  const goalFromReadme = await extractGoalFromReadme(token, repoFullName, defaultBranch)
  if (goalFromReadme) {
    goal = goalFromReadme
  } else {
    const goalFromPkg = await extractGoalFromPackageJson(token, repoFullName, defaultBranch)
    if (goalFromPkg) {
      goal = goalFromPkg
    }
  }

  // Extract stack
  const stack = await extractStackFromPackageJson(token, repoFullName, defaultBranch)

  // Extract constraints
  const constraints = await extractConstraints(token, repoFullName, defaultBranch)

  // Extract conventions
  const conventions = await extractConventions(token, repoFullName, defaultBranch)

  const manifest: IntegrationManifest = {
    goal: goal || `${repoFullName} project`,
    stack,
    constraints,
    conventions,
  }

  const contentHash = generateContentHash(manifest, inputs)

  return {
    manifest,
    contentHash,
    inputs,
  }
}
