#!/usr/bin/env node

/**
 * Reports a single repo-wide Simplicity (maintainability) metric for QA reports.
 * Uses ts-complex to compute maintainability index per file, then averages
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

const ROOT_DIR = path.join(__dirname, '..')

// Same logical scope as vitest coverage: source we care about for quality
const SOURCE_DIRS = ['src', 'api', 'agents', 'projects']
const EXCLUDE_DIRS = ['node_modules', 'dist', 'build', '.git', '.cursor', 'public', 'hal-template']
const SOURCE_EXTENSIONS = ['.ts', '.tsx']
const EXCLUDE_PATTERNS = [
  /\\.test\\.(ts|tsx)$/, // Matches files ending with .test.ts or .test.tsx
  /\\.test\\./, // Matches any file with .test. in the name (e.g., AgentInstructionsViewer.edit.test.tsx)
  /\\.spec\\.(ts|tsx)$/,
  /\\.spec\\./, // Matches any file with .spec. in the name
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

function getRelativePath(filePath) {
  return path.relative(ROOT_DIR, filePath).replace(/\\/g, '/')
}

function main() {
  const args = process.argv.slice(2)
  const includeDetails = args.includes('--details')

  let tscomplex
  try {
    tscomplex = require('ts-complex')
  } catch (e) {
    console.error('ts-complex is required. Run: npm install --save-dev ts-complex')
    process.exit(1)
  }

  const filePaths = collectAllPaths()
  if (filePaths.length === 0) {
    console.log('Simplicity: N/A')
    process.exit(0)
  }

  let sum = 0
  let count = 0
  const fileScores = [] // For --details mode

  for (const filePath of filePaths) {
    try {
      const result = tscomplex.calculateMaintainability(filePath)
      const avg = result?.averageMaintainability
      if (typeof avg === 'number' && Number.isFinite(avg)) {
        sum += avg
        count += 1
        if (includeDetails) {
          const relativePath = getRelativePath(filePath)
          // Only include files that pass the exclusion check (exclude test files, etc.)
          if (!shouldExcludeFile(relativePath)) {
            // Maintainability index is typically 0–171; scale to 0–100 and clamp
            const simplicityPct = Math.round(Math.min(100, Math.max(0, (avg / 171) * 100)))
            fileScores.push({
              file: relativePath,
              maintainability: avg,
              simplicity: simplicityPct,
            })
          }
        }
      }
    } catch (_) {
      // Skip files that fail (e.g. parse errors, unsupported syntax)
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

  // If --details flag is present, write detailed file scores
  if (includeDetails && fileScores.length > 0) {
    // Sort by maintainability (lowest first) - these are the files dragging down simplicity
    fileScores.sort((a, b) => a.maintainability - b.maintainability)
    
    // Take at least top 20, but include all files with the same maintainability as the 20th
    const topN = Math.max(20, fileScores.length)
    const threshold = fileScores[Math.min(19, fileScores.length - 1)]?.maintainability
    const topFiles = fileScores.filter(
      (item, index) => index < topN || item.maintainability === threshold
    )

    const detailsPath = path.join(ROOT_DIR, 'public', 'simplicity-details.json')
    const details = {
      overallSimplicity: simplicityPct,
      overallMaintainability: overallAvg,
      totalFiles: fileScores.length,
      lowestMaintainabilityFiles: topFiles.map((item) => ({
        file: item.file,
        maintainability: Math.round(item.maintainability * 100) / 100, // Round to 2 decimals
        simplicity: item.simplicity,
      })),
      generatedAt: new Date().toISOString(),
    }

    fs.mkdirSync(path.dirname(detailsPath), { recursive: true })
    fs.writeFileSync(detailsPath, JSON.stringify(details, null, 2) + '\n', 'utf8')
  }
}

main()
