#!/usr/bin/env node

/**
 * Reports a single repo-wide Simplicity (maintainability) metric for QA reports.
 * Uses TypeScript compiler API to compute maintainability index per file, then averages
 * across the whole repo (same scope as test coverage: src, api, agents, projects).
 * Outputs "Simplicity: XX%" so QA report body_md can include it and the dashboard can parse it.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const require = createRequire(import.meta.url)
const ts = require('typescript')

const ROOT_DIR = path.join(__dirname, '..')

// Same logical scope as vitest coverage: source we care about for quality
const SOURCE_DIRS = ['src', 'api', 'agents', 'projects']
const EXCLUDE_DIRS = ['node_modules', 'dist', 'build', '.git', '.cursor', 'public', 'hal-template']
const SOURCE_EXTENSIONS = ['.ts', '.tsx']
const EXCLUDE_PATTERNS = [
  /\\.test\\.(ts|tsx)$/,
  /\\.spec\\.(ts|tsx)$/,
  /test-setup\\.ts$/,
  /setup\\.ts$/,
  /vitest\\.config\\.ts$/,
  /vite\\.config\\.ts$/,
  /\\.d\\.ts$/,
]

function shouldExcludeDir(dirName) {
  return EXCLUDE_DIRS.some((exclude) => dirName === exclude || dirName.startsWith(exclude + '/'))
}

function shouldExcludeFile(relativePath) {
  return EXCLUDE_PATTERNS.some((re) => re.test(relativePath))
}

function isSourceFile(filePath) {
  const ext = path.extname(filePath)
  return SOURCE_EXTENSIONS.includes(ext)
}

function findSourceFiles(dirPath, relativePath = '') {
  const files = []
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)
      const relPath = path.join(relativePath, entry.name).replace(/\\/g, '/')
      if (entry.isDirectory()) {
        if (shouldExcludeDir(entry.name)) continue
        const isInProjectsButNotInSrc =
          relativePath.startsWith('projects/') &&
          !relativePath.includes('/src/') &&
          relativePath.split('/').length === 2
        if (isInProjectsButNotInSrc && entry.name !== 'src') continue
        files.push(...findSourceFiles(fullPath, relPath))
      } else if (entry.isFile() && isSourceFile(entry.name) && !shouldExcludeFile(relPath)) {
        files.push(relPath)
      }
    }
  } catch (err) {
    if (err.code !== 'EACCES' && err.code !== 'ENOENT') {
      console.error(`Error reading ${dirPath}:`, err.message)
    }
  }
  return files
}

function collectAllPaths() {
  const paths = []
  for (const sourceDir of SOURCE_DIRS) {
    const dirPath = path.join(ROOT_DIR, sourceDir)
    if (!fs.existsSync(dirPath)) continue
    const files = findSourceFiles(dirPath, sourceDir)
    for (const file of files) {
      paths.push(path.join(ROOT_DIR, file))
    }
  }
  return paths
}

/**
 * Calculate maintainability index for a TypeScript/TSX file.
 * Returns a value between 0-171 (standard maintainability index scale).
 * Returns -1 if the file cannot be analyzed (sentinel value to be excluded).
 */
function calculateMaintainability(filePath) {
  try {
    const sourceText = fs.readFileSync(filePath, 'utf8')
    
    // Create a source file
    const sourceFile = ts.createSourceFile(
      filePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true
    )

    // Count lines of code (non-empty, non-comment lines)
    const lines = sourceText.split('\n')
    const loc = lines.filter(line => {
      const trimmed = line.trim()
      return trimmed.length > 0 && !trimmed.startsWith('//') && !trimmed.startsWith('/*') && !trimmed.startsWith('*')
    }).length

    if (loc === 0) {
      // Empty file or only comments - return a high maintainability score
      return 171
    }

    // Calculate cyclomatic complexity approximation
    // Count decision points: if, else, for, while, switch, case, catch, &&, ||, ? (ternary), ??
    let complexity = 1 // Base complexity
    const complexityKeywords = [
      /\bif\s*\(/g,
      /\belse\s*\{/g,
      /\bfor\s*\(/g,
      /\bwhile\s*\(/g,
      /\bswitch\s*\(/g,
      /\bcase\s+/g,
      /\bcatch\s*\(/g,
      /\?\s*[^:]/g, // ternary operator
      /\?\?/g, // nullish coalescing
      /&&/g,
      /\|\|/g,
    ]
    
    for (const pattern of complexityKeywords) {
      const matches = sourceText.match(pattern)
      if (matches) {
        complexity += matches.length
      }
    }

    // Count function/method declarations (each adds to complexity)
    function countNodes(node) {
      let count = 0
      if (
        node.kind === ts.SyntaxKind.FunctionDeclaration ||
        node.kind === ts.SyntaxKind.MethodDeclaration ||
        node.kind === ts.SyntaxKind.ArrowFunction ||
        node.kind === ts.SyntaxKind.FunctionExpression
      ) {
        count = 1
      }
      ts.forEachChild(node, child => {
        count += countNodes(child)
      })
      return count
    }
    const functionCount = countNodes(sourceFile)

    // Simplified Maintainability Index calculation
    // MI = 171 - 5.2 * ln(Halstead Volume) - 0.23 * (Cyclomatic Complexity) - 16.2 * ln(LOC)
    // For simplicity, we'll use a simplified formula:
    // MI ≈ 171 - 0.23 * complexity - 16.2 * ln(LOC) - 0.1 * functionCount
    const halsteadVolume = Math.max(1, loc * 2) // Rough approximation
    const mi = 171 
      - 5.2 * Math.log(Math.max(1, halsteadVolume))
      - 0.23 * complexity
      - 16.2 * Math.log(Math.max(1, loc))
      - 0.1 * functionCount

    // Clamp to valid range (0-171)
    return Math.max(0, Math.min(171, mi))
  } catch (error) {
    // Return sentinel value for files that can't be analyzed
    return -1
  }
}

function readJson(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8')
}

function main() {
  const filePaths = collectAllPaths()
  if (filePaths.length === 0) {
    console.log('Simplicity: N/A')
    process.exit(0)
  }

  let sum = 0
  let count = 0
  const fileMaintainability = []
  
  for (const filePath of filePaths) {
    const relativePath = path.relative(ROOT_DIR, filePath).replace(/\\/g, '/')
    const maintainability = calculateMaintainability(filePath)
    // Explicitly exclude sentinel values (-1) and ensure value is valid
    if (maintainability >= 0 && maintainability <= 171 && Number.isFinite(maintainability)) {
      sum += maintainability
      count += 1
      fileMaintainability.push({ file: relativePath, maintainability })
    }
  }

  if (count === 0) {
    console.log('Simplicity: N/A')
    process.exit(0)
  }

  const overallAvg = sum / count
  // Maintainability index is typically 0–171; scale to 0–100 and clamp
  const simplicityPct = Math.round(Math.min(100, Math.max(0, (overallAvg / 171) * 100)))
  console.log(`Simplicity: ${simplicityPct}%`)

  // Update repo metrics file for dashboard (no QA report parsing)
  const metricsPath = path.join(ROOT_DIR, 'public', 'metrics.json')
  let metrics = { coverage: null, simplicity: null, updatedAt: null }
  try {
    const raw = fs.readFileSync(metricsPath, 'utf8')
    metrics = { ...metrics, ...JSON.parse(raw) }
  } catch (_) {}
  metrics.simplicity = simplicityPct
  metrics.updatedAt = new Date().toISOString()
  fs.mkdirSync(path.dirname(metricsPath), { recursive: true })
  fs.writeFileSync(metricsPath, JSON.stringify(metrics, null, 2) + '\n', 'utf8')

  // Generate simplicity-details.json with top offenders and improvements
  const simplicityDetailsPath = path.join(ROOT_DIR, 'public', 'simplicity-details.json')
  
  // Sort by maintainability (ascending) to get worst offenders first
  fileMaintainability.sort((a, b) => a.maintainability - b.maintainability)
  
  // Top 20 offenders (lowest maintainability)
  const topOffenders = fileMaintainability.slice(0, 20).map((item) => ({
    file: item.file,
    maintainability: Math.round(item.maintainability * 100) / 100, // Keep precision for maintainability index
  }))

  // Compare with previous simplicity-details.json to find improvements
  const previousDetails = readJson(simplicityDetailsPath, null)
  const previousMaintainability = previousDetails?.topOffenders
    ? new Map(previousDetails.topOffenders.map((item) => [item.file, item.maintainability]))
    : null

  const improvements = fileMaintainability
    .map((item) => {
      const before = previousMaintainability?.get(item.file) ?? null
      const after = item.maintainability
      const delta = before !== null ? after - before : 0
      return { file: item.file, before, after, delta }
    })
    .filter((item) => item.delta > 0) // Only improvements
    .sort((a, b) => b.delta - a.delta) // Sort by delta descending
    .slice(0, 10) // Top 10 improvements
    .map((item) => ({
      file: item.file,
      before: item.before !== null ? Math.round(item.before * 100) / 100 : null,
      after: Math.round(item.after * 100) / 100,
      delta: Math.round(item.delta * 100) / 100,
    }))

  const simplicityDetails = {
    topOffenders,
    mostRecentImprovements: improvements,
    generatedAt: new Date().toISOString(),
  }

  writeJson(simplicityDetailsPath, simplicityDetails)
}

main()
