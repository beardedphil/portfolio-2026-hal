#!/usr/bin/env node

/**
 * Reads coverage/coverage-summary.json (from vitest --coverage) and updates
 * public/metrics.json with the overall coverage percentage (lines). Merges with
 * existing metrics so maintainability and updatedAt are preserved or set.
 * Also generates public/coverage-details.json with top offenders and improvements.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.join(__dirname, '..')
const COVERAGE_SUMMARY = path.join(ROOT, 'coverage', 'coverage-summary.json')
const METRICS_FILE = path.join(ROOT, 'public', 'metrics.json')
const COVERAGE_DETAILS_FILE = path.join(ROOT, 'public', 'coverage-details.json')

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

// Exclude test files and generated/vendor directories (consistent with existing scope rules)
function shouldExcludeFile(filePath) {
  const normalized = filePath.replace(/\\/g, '/')
  // Exclude test files
  if (/\\.test\\.(ts|tsx|js|jsx)$/.test(normalized)) return true
  if (/\\.spec\\.(ts|tsx|js|jsx)$/.test(normalized)) return true
  if (/test-setup\\.(ts|tsx|js|jsx)$/.test(normalized)) return true
  if (/setup\\.(ts|tsx|js|jsx)$/.test(normalized)) return true
  // Exclude generated/vendor directories
  if (normalized.includes('node_modules/')) return true
  if (normalized.includes('dist/')) return true
  if (normalized.includes('build/')) return true
  if (normalized.includes('.git/')) return true
  if (normalized.includes('.cursor/')) return true
  if (normalized.includes('coverage/')) return true
  return false
}

const summary = readJson(COVERAGE_SUMMARY, null)
if (summary?.total?.lines?.pct == null) {
  process.exit(0)
}

const linesPct = summary.total.lines.pct
const coverage = Math.min(100, Math.max(0, Number(linesPct)))

const metrics = readJson(METRICS_FILE, { coverage: null, maintainability: null, updatedAt: null })
// Preserve maintainability fields if they exist
metrics.coverage = Math.round(coverage * 10) / 10
metrics.updatedAt = new Date().toISOString()
writeJson(METRICS_FILE, metrics)

// Generate coverage-details.json with top offenders and improvements
const fileEntries = Object.entries(summary).filter(([key]) => key !== 'total')
const fileCoverage = fileEntries
  .map(([filePath, data]) => {
    const coverage = data?.lines?.pct ?? 0
    return { file: filePath, coverage: Number(coverage) }
  })
  .filter((item) => !shouldExcludeFile(item.file))

// Sort by coverage (ascending) to get worst offenders first
fileCoverage.sort((a, b) => a.coverage - b.coverage)

// Top 20 offenders (lowest coverage)
const topOffenders = fileCoverage.slice(0, 20).map((item) => ({
  file: item.file,
  coverage: Math.round(item.coverage * 10) / 10,
}))

// Compare with previous coverage-details.json to find improvements
const previousDetails = readJson(COVERAGE_DETAILS_FILE, null)
const previousCoverage = previousDetails?.topOffenders
  ? new Map(previousDetails.topOffenders.map((item) => [item.file, item.coverage]))
  : null

const improvements = fileCoverage
  .map((item) => {
    const before = previousCoverage?.get(item.file) ?? null
    const after = item.coverage
    const delta = before !== null ? after - before : 0
    return { file: item.file, before, after, delta }
  })
  .filter((item) => item.delta > 0) // Only improvements
  .sort((a, b) => b.delta - a.delta) // Sort by delta descending
  .slice(0, 10) // Top 10 improvements
  .map((item) => ({
    file: item.file,
    before: item.before !== null ? Math.round(item.before * 10) / 10 : null,
    after: Math.round(item.after * 10) / 10,
    delta: Math.round(item.delta * 10) / 10,
  }))

const coverageDetails = {
  topOffenders,
  mostRecentImprovements: improvements,
  generatedAt: new Date().toISOString(),
}

writeJson(COVERAGE_DETAILS_FILE, coverageDetails)
