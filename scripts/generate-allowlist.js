#!/usr/bin/env node

/**
 * Generates .line-limit-allowlist.json from current report:lines output.
 * This captures the current state of files exceeding 250 lines as baselines.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT_DIR = path.join(__dirname, '..')

// Run report:lines and capture output
const output = execSync('npm run report:lines', { encoding: 'utf-8', cwd: ROOT_DIR })

// Parse the output to extract file paths and line counts
const lines = output.split('\n')
const offenders = []

// Skip header lines and find the data section
let inDataSection = false
for (const line of lines) {
  if (line.includes('Lines | Path')) {
    inDataSection = true
    continue
  }
  if (line.includes('------')) {
    continue
  }
  if (inDataSection && line.trim()) {
    // Parse lines like " 5065 | src/App.tsx"
    const match = line.match(/^\s*(\d+)\s+\|\s+(.+)$/)
    if (match) {
      const lineCount = parseInt(match[1], 10)
      const filePath = match[2].trim()
      offenders.push({
        file: filePath,
        baseline: lineCount
      })
    }
  }
}

// Write allowlist file
const allowlistPath = path.join(ROOT_DIR, '.line-limit-allowlist.json')
const allowlistData = {
  version: 1,
  maxLines: 250,
  files: offenders
}

fs.writeFileSync(allowlistPath, JSON.stringify(allowlistData, null, 2) + '\n')

console.log(`Generated allowlist with ${offenders.length} files`)
console.log(`Allowlist saved to: ${allowlistPath}`)
