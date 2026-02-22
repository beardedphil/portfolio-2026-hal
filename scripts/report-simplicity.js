#!/usr/bin/env node

/**
 * Reports a single repo-wide Code Quality metric for QA reports.
 * Uses TypeScript compiler API to compute a maintainability index per file:
 *   - AST-based cyclomatic complexity (McCabe)
 *   - Real Halstead volume (operator/operand counting)
 *   - Microsoft formula: MI = 171 - 5.2*ln(HV) - 0.23*CC - 16.2*ln(LOC)
 * Averages across the repo (same scope as coverage: src, api, agents, projects).
 * Outputs "Code Quality: XX%" for QA reports and the dashboard.
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
 * Compute cyclomatic complexity for a node (function/method/file).
 * Counts decision points: if, for, while, switch/case, catch, ternary, &&, ||.
 */
function computeCyclomaticComplexity(node) {
  let complexity = 1

  function visit(n) {
    switch (n.kind) {
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
        const op = n.operatorToken?.kind
        if (op === ts.SyntaxKind.AmpersandAmpersandToken || op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) {
          complexity += 1
        }
        break
      }
      default:
        break
    }
    ts.forEachChild(n, visit)
  }
  visit(node)
  return complexity
}

/**
 * Compute cyclomatic complexity via AST (McCabe-style) for entire file.
 * Counts decision points: if, for, while, switch/case, catch, ternary, &&, ||.
 */
function getCyclomaticComplexity(sourceFile) {
  return computeCyclomaticComplexity(sourceFile)
}

/**
 * Compute per-function cyclomatic complexity and return statistics.
 * Returns { avgComplexity, maxComplexity, functionCount, totalComplexity }
 */
function getFunctionComplexityMetrics(sourceFile) {
  const functionComplexities = []
  
  function visit(node) {
    // Check for function declarations, methods, arrow functions
    if (
      node.kind === ts.SyntaxKind.FunctionDeclaration ||
      node.kind === ts.SyntaxKind.MethodDeclaration ||
      node.kind === ts.SyntaxKind.FunctionExpression ||
      node.kind === ts.SyntaxKind.ArrowFunction ||
      node.kind === ts.SyntaxKind.GetAccessor ||
      node.kind === ts.SyntaxKind.SetAccessor
    ) {
      const funcComplexity = computeCyclomaticComplexity(node)
      functionComplexities.push(funcComplexity)
    }
    ts.forEachChild(node, visit)
  }
  
  visit(sourceFile)
  
  if (functionComplexities.length === 0) {
    return { avgComplexity: 0, maxComplexity: 0, functionCount: 0, totalComplexity: 0 }
  }
  
  const totalComplexity = functionComplexities.reduce((a, b) => a + b, 0)
  const avgComplexity = totalComplexity / functionComplexities.length
  const maxComplexity = Math.max(...functionComplexities)
  
  return {
    avgComplexity,
    maxComplexity,
    functionCount: functionComplexities.length,
    totalComplexity
  }
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
 * Count functions and compute average function length (LOC per function).
 */
function getFunctionMetrics(sourceFile, sourceText) {
  const lines = sourceText.split('\n')
  let functionCount = 0
  let totalFunctionLines = 0
  
  function visit(node) {
    if (
      node.kind === ts.SyntaxKind.FunctionDeclaration ||
      node.kind === ts.SyntaxKind.MethodDeclaration ||
      node.kind === ts.SyntaxKind.FunctionExpression ||
      node.kind === ts.SyntaxKind.ArrowFunction ||
      node.kind === ts.SyntaxKind.GetAccessor ||
      node.kind === ts.SyntaxKind.SetAccessor
    ) {
      functionCount++
      const start = node.getFullStart()
      const end = node.getEnd()
      const funcText = sourceText.substring(start, end)
      const funcLines = funcText.split('\n').filter(line => {
        const trimmed = line.trim()
        return trimmed.length > 0 && !trimmed.startsWith('//') && !trimmed.startsWith('/*') && !trimmed.startsWith('*')
      }).length
      totalFunctionLines += funcLines
    }
    ts.forEachChild(node, visit)
  }
  
  visit(sourceFile)
  
  return {
    functionCount,
    avgFunctionLength: functionCount > 0 ? totalFunctionLines / functionCount : 0,
    totalFunctionLines
  }
}

/**
 * Analyze type safety: count `any` usage and missing return types.
 * Returns { anyCount, missingReturnTypeCount, totalFunctions, typeSafetyScore }
 */
function getTypeSafetyMetrics(sourceFile) {
  let anyCount = 0
  let missingReturnTypeCount = 0
  let totalFunctions = 0
  
  function visit(node) {
    // Count `any` in type annotations
    if (node.kind === ts.SyntaxKind.AnyKeyword) {
      anyCount++
    }
    
    // Check function return types
    if (
      node.kind === ts.SyntaxKind.FunctionDeclaration ||
      node.kind === ts.SyntaxKind.MethodDeclaration ||
      node.kind === ts.SyntaxKind.FunctionExpression ||
      node.kind === ts.SyntaxKind.ArrowFunction
    ) {
      totalFunctions++
      // Check if return type is missing (not explicitly declared)
      if (!node.type) {
        missingReturnTypeCount++
      }
    }
    
    ts.forEachChild(node, visit)
  }
  
  visit(sourceFile)
  
  // Calculate type safety score (0-100)
  // Penalize: any usage (50 points max) and missing return types (30 points max)
  const anyRatio = totalFunctions > 0 ? anyCount / (totalFunctions * 2) : 0 // Normalize: assume max 2 any per function
  const missingTypeRatio = totalFunctions > 0 ? missingReturnTypeCount / totalFunctions : 0
  const typeSafetyScore = Math.max(0, 100 - (anyRatio * 50) - (missingTypeRatio * 30))
  
  return {
    anyCount,
    missingReturnTypeCount,
    totalFunctions,
    typeSafetyScore
  }
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

/**
 * Calculate all quality metrics for a file.
 * Returns { maintainability, functionComplexity, typeSafety, codeOrganization } or null if error.
 */
function calculateFileMetrics(filePath) {
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
      return null // Skip empty files
    }

    // Maintainability index (0-171 scale)
    const maintainability = calculateMaintainability(filePath)
    if (maintainability < 0) return null

    // Function complexity metrics
    const funcMetrics = getFunctionComplexityMetrics(sourceFile)
    const functionComplexityScore = funcMetrics.functionCount > 0
      ? Math.max(0, 100 - (funcMetrics.avgComplexity * 2)) // Penalize: complexity * 2 points
      : 100 // No functions = perfect score (unlikely but handle edge case)

    // Type safety metrics
    const typeSafety = getTypeSafetyMetrics(sourceFile)

    // Code organization (function length, file size)
    const funcOrgMetrics = getFunctionMetrics(sourceFile, sourceText)
    // Penalize: very long functions (>50 LOC) and very large files (>500 LOC)
    const avgFuncLengthPenalty = funcOrgMetrics.avgFunctionLength > 50
      ? Math.min(20, (funcOrgMetrics.avgFunctionLength - 50) * 0.4)
      : 0
    const fileSizePenalty = loc > 500
      ? Math.min(20, (loc - 500) * 0.04)
      : 0
    const codeOrganizationScore = Math.max(0, 100 - avgFuncLengthPenalty - fileSizePenalty)

    return {
      maintainability, // 0-171 scale
      functionComplexity: functionComplexityScore, // 0-100 scale
      typeSafety: typeSafety.typeSafetyScore, // 0-100 scale
      codeOrganization: codeOrganizationScore, // 0-100 scale
      loc,
      funcMetrics,
      typeSafetyMetrics: typeSafety
    }
  } catch (error) {
    return null
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
    console.log('Code Quality: N/A')
    process.exit(0)
  }

  // Collect metrics for all files
  const fileMetrics = []
  let totalMaintainability = 0
  let totalFunctionComplexity = 0
  let totalTypeSafety = 0
  let totalCodeOrganization = 0
  let validFileCount = 0
  
  for (const filePath of filePaths) {
    const relativePath = path.relative(ROOT_DIR, filePath).replace(/\\/g, '/')
    const metrics = calculateFileMetrics(filePath)
    
    if (metrics) {
      validFileCount++
      totalMaintainability += metrics.maintainability
      totalFunctionComplexity += metrics.functionComplexity
      totalTypeSafety += metrics.typeSafety
      totalCodeOrganization += metrics.codeOrganization
      
      fileMetrics.push({
        file: relativePath,
        maintainability: metrics.maintainability,
        functionComplexity: metrics.functionComplexity,
        typeSafety: metrics.typeSafety,
        codeOrganization: metrics.codeOrganization
      })
    }
  }

  if (validFileCount === 0) {
    console.log('Code Quality: N/A')
    process.exit(0)
  }

  // Calculate average scores
  const avgMaintainability = totalMaintainability / validFileCount
  const avgFunctionComplexity = totalFunctionComplexity / validFileCount
  const avgTypeSafety = totalTypeSafety / validFileCount
  const avgCodeOrganization = totalCodeOrganization / validFileCount

  // Convert maintainability from 0-171 scale to 0-100 scale
  const maintainabilityScore = Math.min(100, Math.max(0, (avgMaintainability / 171) * 100))

  // Read test coverage
  const coverageSummaryPath = path.join(ROOT_DIR, 'coverage', 'coverage-summary.json')
  let testCoverageScore = 0
  try {
    const coverageData = readJson(coverageSummaryPath, null)
    if (coverageData?.total?.lines?.pct != null) {
      testCoverageScore = Math.min(100, Math.max(0, Number(coverageData.total.lines.pct)))
    }
  } catch (_) {
    // Coverage not available, use 0
  }

  // Composite Code Quality formula (weighted average)
  // Function Complexity: 30%, Test Coverage: 25%, Maintainability: 25%, Type Safety: 15%, Code Organization: 5%
  const codeQuality = 
    (avgFunctionComplexity * 0.30) +
    (testCoverageScore * 0.25) +
    (maintainabilityScore * 0.25) +
    (avgTypeSafety * 0.15) +
    (avgCodeOrganization * 0.05)

  const unroundedCodeQuality = Math.min(100, Math.max(0, codeQuality))
  const codeQualityPct = Math.round(unroundedCodeQuality)
  console.log(`Code Quality: ${codeQualityPct}%`)

  // Update repo metrics file for dashboard (no QA report parsing)
  const metricsPath = path.join(ROOT_DIR, 'public', 'metrics.json')
  let metrics = { coverage: null, codeQuality: null, updatedAt: null }
  try {
    const raw = fs.readFileSync(metricsPath, 'utf8')
    metrics = { ...metrics, ...JSON.parse(raw) }
  } catch (_) {}
  // Write new field names (Code Quality)
  metrics.codeQuality = codeQualityPct
  metrics.unroundedCodeQuality = Math.round(unroundedCodeQuality * 10) / 10 // Round to 1 decimal place
  // Keep legacy fields for backward compatibility during migration
  metrics.maintainability = codeQualityPct
  metrics.unroundedMaintainability = Math.round(unroundedCodeQuality * 10) / 10
  metrics.simplicity = codeQualityPct
  metrics.unroundedSimplicity = Math.round(unroundedCodeQuality * 10) / 10
  metrics.updatedAt = new Date().toISOString()
  fs.mkdirSync(path.dirname(metricsPath), { recursive: true })
  fs.writeFileSync(metricsPath, JSON.stringify(metrics, null, 2) + '\n', 'utf8')

  // Generate code-quality-details.json with top offenders and improvements
  // Also write to maintainability-details.json and simplicity-details.json for backward compatibility during migration
  const codeQualityDetailsPath = path.join(ROOT_DIR, 'public', 'code-quality-details.json')
  const maintainabilityDetailsPath = path.join(ROOT_DIR, 'public', 'maintainability-details.json')
  const simplicityDetailsPath = path.join(ROOT_DIR, 'public', 'simplicity-details.json')
  
  // Calculate composite code quality per file for ranking
  const fileCodeQuality = fileMetrics.map(item => {
    const maintainabilityScore = Math.min(100, Math.max(0, (item.maintainability / 171) * 100))
    // Use same weights as overall calculation
    const fileQuality = 
      (item.functionComplexity * 0.30) +
      (testCoverageScore * 0.25) + // Use overall coverage for file ranking
      (maintainabilityScore * 0.25) +
      (item.typeSafety * 0.15) +
      (item.codeOrganization * 0.05)
    return {
      file: item.file,
      codeQuality: Math.min(100, Math.max(0, fileQuality)),
      maintainability: item.maintainability
    }
  })

  // Sort by code quality (ascending) to get worst offenders first
  fileCodeQuality.sort((a, b) => a.codeQuality - b.codeQuality)
  
  // Top 20 offenders (lowest code quality)
  const topOffenders = fileCodeQuality.slice(0, 20).map((item) => ({
    file: item.file,
    codeQuality: Math.round(item.codeQuality * 100) / 100, // Keep precision
    // Legacy field for backward compatibility
    maintainability: Math.round((item.maintainability / 171) * 100 * 100) / 100,
  }))

  // Compare with previous code-quality-details.json, maintainability-details.json, or simplicity-details.json to find improvements
  const previousCodeQualityDetails = readJson(codeQualityDetailsPath, null)
  const previousMaintainabilityDetails = readJson(maintainabilityDetailsPath, null)
  const previousSimplicityDetails = readJson(simplicityDetailsPath, null)
  const previousDetails = previousCodeQualityDetails ?? previousMaintainabilityDetails ?? previousSimplicityDetails
  
  // Support both new (codeQuality) and legacy (maintainability) field names
  const previousCodeQuality = previousDetails?.topOffenders
    ? new Map(previousDetails.topOffenders.map((item) => {
        const file = item.file
        // Try codeQuality first, fall back to maintainability (convert index to percentage)
        const value = item.codeQuality ?? (item.maintainability != null ? (item.maintainability / 171) * 100 : null)
        return [file, value]
      }))
    : null

  const improvements = fileCodeQuality
    .map((item) => {
      const before = previousCodeQuality?.get(item.file) ?? null
      const after = item.codeQuality
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

  const codeQualityDetails = {
    topOffenders,
    mostRecentImprovements: improvements,
    generatedAt: new Date().toISOString(),
    filesAnalyzed: validFileCount,
    unroundedCodeQuality: Math.round(unroundedCodeQuality * 10) / 10, // Round to 1 decimal place
    // Legacy fields for backward compatibility
    unroundedMaintainability: Math.round(unroundedCodeQuality * 10) / 10,
    unroundedSimplicity: Math.round(unroundedCodeQuality * 10) / 10,
  }

  // Write to new file (code-quality-details.json)
  writeJson(codeQualityDetailsPath, codeQualityDetails)
  // Also write to legacy files for backward compatibility during migration
  writeJson(maintainabilityDetailsPath, codeQualityDetails)
  writeJson(simplicityDetailsPath, codeQualityDetails)
}

main()
