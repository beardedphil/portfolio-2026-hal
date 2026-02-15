#!/usr/bin/env node

/**
 * Blocking line limit check that fails when:
 * - A non-allowlisted file exceeds 250 lines, OR
 * - An allowlisted file exceeds its recorded baseline
 * 
 * Exits with non-zero code on violations.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const ROOT_DIR = path.join(__dirname, '..')
const MAX_LINES = 250
const ALLOWLIST_PATH = path.join(ROOT_DIR, '.line-limit-allowlist.json')

// Source directories to include (same as report-lines.js)
const SOURCE_DIRS = [
  'src',
  'api',
  'agents',
  'scripts',
  'projects',
]

// Directories to exclude
const EXCLUDE_DIRS = [
  'node_modules',
  'dist',
  'build',
  '.git',
  '.cursor',
  'public',
]

// File extensions to include
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']

/**
 * Load allowlist from file
 */
function loadAllowlist() {
  if (!fs.existsSync(ALLOWLIST_PATH)) {
    console.error(`Error: Allowlist file not found: ${ALLOWLIST_PATH}`)
    process.exit(1)
  }
  
  try {
    const content = fs.readFileSync(ALLOWLIST_PATH, 'utf-8')
    const data = JSON.parse(content)
    
    // Convert array to map for quick lookup
    const allowlistMap = new Map()
    if (Array.isArray(data.files)) {
      for (const entry of data.files) {
        allowlistMap.set(entry.file, entry.baseline)
      }
    }
    
    return {
      maxLines: data.maxLines || MAX_LINES,
      files: allowlistMap
    }
  } catch (err) {
    console.error(`Error reading allowlist: ${err.message}`)
    process.exit(1)
  }
}

/**
 * Check if a directory should be excluded
 */
function shouldExcludeDir(dirName) {
  return EXCLUDE_DIRS.some(exclude => dirName === exclude || dirName.startsWith(exclude + '/'))
}

/**
 * Check if a file is a source file
 */
function isSourceFile(filePath) {
  const ext = path.extname(filePath)
  return SOURCE_EXTENSIONS.includes(ext)
}

/**
 * Count lines in a file
 */
function countLines(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    return content.split('\n').length
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err.message)
    return 0
  }
}

/**
 * Recursively find source files in a directory
 */
function findSourceFiles(dirPath, relativePath = '') {
  const files = []
  
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)
      const relPath = path.join(relativePath, entry.name)
      
      if (entry.isDirectory()) {
        // Skip excluded directories
        if (shouldExcludeDir(entry.name)) {
          continue
        }
        
        // For projects/*, only recurse into src subdirectories (not other subdirs)
        // But once inside projects/*/src, recurse normally
        const isInProjectsButNotInSrc = relativePath.startsWith('projects/') && 
                                        !relativePath.includes('/src/') && 
                                        relativePath.split('/').length === 2
        if (isInProjectsButNotInSrc && entry.name !== 'src') {
          continue
        }
        
        // Recurse into subdirectories
        files.push(...findSourceFiles(fullPath, relPath))
      } else if (entry.isFile() && isSourceFile(entry.name)) {
        files.push(relPath)
      }
    }
  } catch (err) {
    // Skip directories we can't read (permissions, etc.)
    if (err.code !== 'EACCES' && err.code !== 'ENOENT') {
      console.error(`Error reading ${dirPath}:`, err.message)
    }
  }
  
  return files
}

/**
 * Main check function
 */
function checkLineLimits() {
  const allowlist = loadAllowlist()
  const maxLines = allowlist.maxLines
  const violations = []
  
  // Find all source files in source directories
  const allFiles = []
  for (const sourceDir of SOURCE_DIRS) {
    const dirPath = path.join(ROOT_DIR, sourceDir)
    
    if (!fs.existsSync(dirPath)) {
      continue
    }
    
    const files = findSourceFiles(dirPath, sourceDir)
    allFiles.push(...files)
  }
  
  // Check each file
  for (const file of allFiles) {
    const fullPath = path.join(ROOT_DIR, file)
    const lineCount = countLines(fullPath)
    const baseline = allowlist.files.get(file)
    
    if (baseline !== undefined) {
      // File is allowlisted - check against baseline
      if (lineCount > baseline) {
        violations.push({
          file,
          lines: lineCount,
          baseline,
          type: 'allowlisted_exceeded'
        })
      }
    } else {
      // File is not allowlisted - check against max lines
      if (lineCount > maxLines) {
        violations.push({
          file,
          lines: lineCount,
          maxLines,
          type: 'non_allowlisted'
        })
      }
    }
  }
  
  // Report violations
  if (violations.length === 0) {
    console.log(`✓ All source files comply with line limits (max: ${maxLines} lines)`)
    return true
  }
  
  console.error(`\n❌ Line limit violations found (${violations.length}):\n`)
  
  // Group violations by type
  const nonAllowlisted = violations.filter(v => v.type === 'non_allowlisted')
  const exceededBaseline = violations.filter(v => v.type === 'allowlisted_exceeded')
  
  if (nonAllowlisted.length > 0) {
    console.error(`Non-allowlisted files exceeding ${maxLines} lines:\n`)
    console.error('Lines | Path')
    console.error('------|' + '-'.repeat(60))
    for (const v of nonAllowlisted) {
      console.error(`${String(v.lines).padStart(5)} | ${v.file} (max: ${v.maxLines})`)
    }
    console.error('')
  }
  
  if (exceededBaseline.length > 0) {
    console.error(`Allowlisted files exceeding their baseline:\n`)
    console.error('Lines | Baseline | Path')
    console.error('------|----------|' + '-'.repeat(50))
    for (const v of exceededBaseline) {
      console.error(`${String(v.lines).padStart(5)} | ${String(v.baseline).padStart(8)} | ${v.file}`)
    }
    console.error('')
  }
  
  console.error(`\nTotal violations: ${violations.length}`)
  console.error(`\nTo fix:`)
  console.error(`- For new files: Refactor to stay under ${maxLines} lines`)
  console.error(`- For allowlisted files: Refactor to stay under recorded baseline, or update baseline in .line-limit-allowlist.json`)
  
  return false
}

// Run the check
const passed = checkLineLimits()
process.exit(passed ? 0 : 1)
