#!/usr/bin/env node

/**
 * Advisory line limit check: reports source files over 250 lines.
 * Does not block the build (exits 0). Refactor long files over time;
 * use `npm run report:lines` for a full report.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const ROOT_DIR = path.join(__dirname, '..')
const MAX_LINES = 250

const SOURCE_DIRS = ['src', 'api', 'agents', 'scripts', 'projects']
const EXCLUDE_DIRS = ['node_modules', 'dist', 'dist-kanban-lib', 'build', '.git', '.cursor', 'public']
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']

function shouldExcludeDir(dirName) {
  return EXCLUDE_DIRS.some((exclude) => dirName === exclude || dirName.startsWith(exclude + '/'))
}

function isSourceFile(filePath) {
  return SOURCE_EXTENSIONS.includes(path.extname(filePath))
}

function countLines(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8').split('\n').length
  } catch {
    return 0
  }
}

function findSourceFiles(dirPath, relativePath = '') {
  const files = []
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)
      const relPath = path.join(relativePath, entry.name)
      if (entry.isDirectory()) {
        if (shouldExcludeDir(entry.name)) continue
        const isInProjectsButNotInSrc =
          relativePath.startsWith('projects/') &&
          !relativePath.includes('/src/') &&
          relativePath.split('/').length === 2
        if (isInProjectsButNotInSrc && entry.name !== 'src') continue
        files.push(...findSourceFiles(fullPath, relPath))
      } else if (entry.isFile() && isSourceFile(entry.name)) {
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

function runCheck() {
  const allFiles = []
  for (const sourceDir of SOURCE_DIRS) {
    const dirPath = path.join(ROOT_DIR, sourceDir)
    if (!fs.existsSync(dirPath)) continue
    allFiles.push(...findSourceFiles(dirPath, sourceDir))
  }

  const over = []
  for (const file of allFiles) {
    const lineCount = countLines(path.join(ROOT_DIR, file))
    if (lineCount > MAX_LINES) over.push({ file, lines: lineCount })
  }

  if (over.length === 0) {
    console.log(`✓ All source files under ${MAX_LINES} lines`)
    return
  }

  over.sort((a, b) => b.lines - a.lines)
  console.log(`\n⚠ ${over.length} file(s) over ${MAX_LINES} lines (advisory; build not blocked):\n`)
  console.log('Lines | Path')
  console.log('------|' + '-'.repeat(60))
  for (const v of over) {
    console.log(`${String(v.lines).padStart(5)} | ${v.file}`)
  }
  console.log('\nRefactor when convenient; run `npm run report:lines` for full report.\n')
}

runCheck()
process.exit(0)
