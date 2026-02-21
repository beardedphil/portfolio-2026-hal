#!/usr/bin/env node

/**
 * Reports a single repo-wide Simplicity metric for QA reports.
 * Uses TypeScript compiler API to compute a maintainability index per file:
 *   - AST-based cyclomatic complexity (McCabe)
 *   - Real Halstead volume (operator/operand counting)
 *   - Microsoft formula: MI = 171 - 5.2*ln(HV) - 0.23*CC - 16.2*ln(LOC)
 * Averages across the repo (same scope as coverage: src, api, agents, projects).
 * Outputs "Simplicity: XX%" for QA reports and the dashboard.
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
 * Compute cyclomatic complexity via AST (McCabe-style).
 * Counts decision points: if, for, while, switch/case, catch, ternary, &&, ||.
 */
function getCyclomaticComplexity(sourceFile) {
  let complexity = 1

  function visit(node) {
    switch (node.kind) {
      case ts.SyntaxKind.IfStatement:
      case ts.SyntaxKind.ForStatement:
      case ts.SyntaxKind.ForInStatement:
      case ts.SyntaxKind.ForOfStatement:
      case ts.SyntaxKind.WhileStatement:
      case ts.SyntaxKind.DoStatement:
      case ts.SyntaxKind.SwitchStatement:
      case ts.SyntaxKind.CatchClause:
      case ts.SyntaxKind.ConditionalExpression:
        complexity += 1
        break
      case ts.SyntaxKind.CaseClause:
      case ts.SyntaxKind.DefaultClause:
        complexity += 1
        break
      case ts.SyntaxKind.BinaryExpression: {
        const op = node.operatorToken?.kind
        if (op === ts.SyntaxKind.AmpersandAmpersandToken || op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) {
          complexity += 1
        }
        break
      }
      default:
        break
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return complexity
}

/**
 * Compute Halstead Volume via AST (operator/operand counting).
 * Returns { volume, operators, operands } or null if file has no meaningful content.
 */
function getHalsteadMetrics(sourceFile, sourceText) {
  const operatorCounts = new Map()
  const operandCounts = new Map()

  function addOperator(token) {
    const key = typeof token === 'number' ? ts.SyntaxKind[token] ?? String(token) : String(token)
    operatorCounts.set(key, (operatorCounts.get(key) ?? 0) + 1)
  }

  function addOperand(token) {
    const key = String(token)
    operandCounts.set(key, (operandCounts.get(key) ?? 0) + 1)
  }

  function visit(node) {
    if (!node) return

    switch (node.kind) {
      case ts.SyntaxKind.Identifier:
      case ts.SyntaxKind.PrivateIdentifier:
        addOperand(node.getText(sourceFile))
        break
      case ts.SyntaxKind.NumericLiteral:
      case ts.SyntaxKind.StringLiteral:
      case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
      case ts.SyntaxKind.TemplateHead:
      case ts.SyntaxKind.TemplateMiddle:
      case ts.SyntaxKind.TemplateTail:
      case ts.SyntaxKind.RegularExpressionLiteral:
      case ts.SyntaxKind.BigIntLiteral:
        addOperand(node.getText(sourceFile))
        break
      case ts.SyntaxKind.BinaryExpression:
        addOperator(node.operatorToken?.kind)
        break
      case ts.SyntaxKind.PrefixUnaryExpression:
      case ts.SyntaxKind.PostfixUnaryExpression:
        addOperator(node.operator)
        break
      case ts.SyntaxKind.ConditionalExpression:
        addOperator(ts.SyntaxKind.QuestionToken)
        break
      case ts.SyntaxKind.PropertyAccessExpression:
      case ts.SyntaxKind.ElementAccessExpression:
        addOperator('.')
        break
      case ts.SyntaxKind.CallExpression:
      case ts.SyntaxKind.NewExpression:
        addOperator('()')
        break
      case ts.SyntaxKind.VoidExpression:
        addOperator(ts.SyntaxKind.VoidKeyword)
        break
      case ts.SyntaxKind.TypeOfExpression:
        addOperator(ts.SyntaxKind.TypeOfKeyword)
        break
      case ts.SyntaxKind.DeleteExpression:
        addOperator(ts.SyntaxKind.DeleteKeyword)
        break
      case ts.SyntaxKind.AwaitExpression:
        addOperator(ts.SyntaxKind.AwaitKeyword)
        break
      default:
        break
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)

  const N1 = [...operatorCounts.values()].reduce((a, b) => a + b, 0)
  const N2 = [...operandCounts.values()].reduce((a, b) => a + b, 0)
  const n1 = operatorCounts.size
  const n2 = operandCounts.size
  const N = N1 + N2
  const n = n1 + n2
  if (n === 0 || N === 0) return null
  const volume = N * Math.log2(n)
  return { volume: Math.max(1, volume), N1, N2, n1, n2 }
}

/**
 * Count logical lines of code (non-empty, non-comment).
 */
function getLinesOfCode(sourceText) {
  const lines = sourceText.split('\n')
  return lines.filter(line => {
    const trimmed = line.trim()
    return trimmed.length > 0 && !trimmed.startsWith('//') && !trimmed.startsWith('/*') && !trimmed.startsWith('*')
  }).length
}

/**
 * Calculate maintainability index for a TypeScript/TSX file.
 * Uses Microsoft-style formula with real cyclomatic complexity and Halstead volume.
 * Returns a value between 0-171 (standard maintainability index scale).
 * Returns -1 if the file cannot be analyzed (sentinel value to be excluded).
 */
function calculateMaintainability(filePath) {
  try {
    const sourceText = fs.readFileSync(filePath, 'utf8')
    const sourceFile = ts.createSourceFile(
      filePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true
    )

    const loc = getLinesOfCode(sourceText)
    if (loc === 0) {
      return 171
    }

    const complexity = getCyclomaticComplexity(sourceFile)
    const halstead = getHalsteadMetrics(sourceFile, sourceText)
    const halsteadVolume = halstead?.volume ?? Math.max(1, loc * 2)

    // Microsoft Maintainability Index: MI = 171 - 5.2*ln(HV) - 0.23*CC - 16.2*ln(LOC)
    const mi = 171
      - 5.2 * Math.log(halsteadVolume)
      - 0.23 * complexity
      - 16.2 * Math.log(Math.max(1, loc))

    return Math.max(0, Math.min(171, mi))
  } catch (error) {
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
  const unroundedMaintainability = Math.min(100, Math.max(0, (overallAvg / 171) * 100))
  const maintainabilityPct = Math.round(unroundedMaintainability)
  console.log(`Simplicity: ${maintainabilityPct}%`)

  // Update repo metrics file for dashboard (no QA report parsing)
  const metricsPath = path.join(ROOT_DIR, 'public', 'metrics.json')
  let metrics = { coverage: null, maintainability: null, updatedAt: null }
  try {
    const raw = fs.readFileSync(metricsPath, 'utf8')
    metrics = { ...metrics, ...JSON.parse(raw) }
  } catch (_) {}
  // Write new field names
  metrics.maintainability = maintainabilityPct
  metrics.unroundedMaintainability = Math.round(unroundedMaintainability * 10) / 10 // Round to 1 decimal place
  // Keep legacy fields for backward compatibility during migration
  metrics.simplicity = maintainabilityPct
  metrics.unroundedSimplicity = Math.round(unroundedMaintainability * 10) / 10
  metrics.updatedAt = new Date().toISOString()
  fs.mkdirSync(path.dirname(metricsPath), { recursive: true })
  fs.writeFileSync(metricsPath, JSON.stringify(metrics, null, 2) + '\n', 'utf8')

  // Generate maintainability-details.json with top offenders and improvements
  // Also write to simplicity-details.json for backward compatibility during migration
  const maintainabilityDetailsPath = path.join(ROOT_DIR, 'public', 'maintainability-details.json')
  const simplicityDetailsPath = path.join(ROOT_DIR, 'public', 'simplicity-details.json')
  
  // Sort by maintainability (ascending) to get worst offenders first
  fileMaintainability.sort((a, b) => a.maintainability - b.maintainability)
  
  // Top 20 offenders (lowest maintainability)
  const topOffenders = fileMaintainability.slice(0, 20).map((item) => ({
    file: item.file,
    maintainability: Math.round(item.maintainability * 100) / 100, // Keep precision for maintainability index
  }))

  // Compare with previous maintainability-details.json or simplicity-details.json to find improvements
  const previousMaintainabilityDetails = readJson(maintainabilityDetailsPath, null)
  const previousSimplicityDetails = readJson(simplicityDetailsPath, null)
  const previousDetails = previousMaintainabilityDetails ?? previousSimplicityDetails
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

  const maintainabilityDetails = {
    topOffenders,
    mostRecentImprovements: improvements,
    generatedAt: new Date().toISOString(),
    filesAnalyzed: count,
    unroundedMaintainability: Math.round(unroundedMaintainability * 10) / 10, // Round to 1 decimal place
    // Legacy field for backward compatibility
    unroundedSimplicity: Math.round(unroundedMaintainability * 10) / 10,
  }

  // Write to both files during migration
  writeJson(maintainabilityDetailsPath, maintainabilityDetails)
  writeJson(simplicityDetailsPath, maintainabilityDetails) // Backward compatibility
}

main()
