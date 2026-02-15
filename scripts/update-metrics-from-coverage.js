#!/usr/bin/env node

/**
 * Reads coverage/coverage-summary.json (from vitest --coverage) and updates
 * public/metrics.json with the overall coverage percentage (lines). Merges with
 * existing metrics so simplicity and updatedAt are preserved or set.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.join(__dirname, '..')
const COVERAGE_SUMMARY = path.join(ROOT, 'coverage', 'coverage-summary.json')
const METRICS_FILE = path.join(ROOT, 'public', 'metrics.json')

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

const summary = readJson(COVERAGE_SUMMARY, null)
if (summary?.total?.lines?.pct == null) {
  process.exit(0)
}

const linesPct = summary.total.lines.pct
const coverage = Math.min(100, Math.max(0, Number(linesPct)))

const metrics = readJson(METRICS_FILE, { coverage: null, simplicity: null, updatedAt: null })
metrics.coverage = Math.round(coverage * 10) / 10
metrics.updatedAt = new Date().toISOString()
writeJson(METRICS_FILE, metrics)
