#!/usr/bin/env node

/**
 * Extracts overcomplication data for QA reports:
 * - Max allowed lines (from allowlist)
 * - Whether the gate passed (check:lines exit code)
 * - Count of allowlisted files
 * - Top 10 largest source files with line counts
 * 
 * Outputs JSON to stdout for programmatic use.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const ROOT_DIR = path.join(__dirname, '..')
const MAX_LINES = 250
const ALLOWLIST_PATH = path.join(ROOT_DIR, '.line-limit-allowlist.json')

// Source directories to include (same as report-lines.js and check-lines.js)
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
    return { maxLines: MAX_LINES, files: new Map() }
  }
  
  try {
    const content = fs.readFileSync(ALLOWLIST_PATH, 'utf-8')
    const data = JSON.parse(content)
    
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
    return { maxLines: MAX_LINES, files: new Map() }
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
        if (shouldExcludeDir(entry.name)) {
          continue
        }
        
        const isInProjectsButNotInSrc = relativePath.startsWith('projects/') && 
                                        !relativePath.includes('/src/') && 
                                        relativePath.split('/').length === 2
        if (isInProjectsButNotInSrc && entry.name !== 'src') {
          continue
        }
        
        files.push(...findSourceFiles(fullPath, relPath))
      } else if (entry.isFile() && isSourceFile(entry.name)) {
        files.push(relPath)
      }
    }
  } catch (err) {
    // Skip directories we can't read
  }
  
  return files
}

/**
 * Check if gate passed by running check:lines
 */
function checkGatePassed() {
  try {
    execSync('npm run check:lines', { 
      cwd: ROOT_DIR, 
      stdio: 'ignore' 
    })
    return true
  } catch {
    return false
  }
}

/**
 * Get all source files with line counts
 */
function getAllSourceFiles() {
  const allFiles = []
  
  for (const sourceDir of SOURCE_DIRS) {
    const dirPath = path.join(ROOT_DIR, sourceDir)
    
    if (!fs.existsSync(dirPath)) {
      continue
    }
    
    const files = findSourceFiles(dirPath, sourceDir)
    allFiles.push(...files)
  }
  
  // Get line counts for all files
  const filesWithLines = allFiles.map(file => {
    const fullPath = path.join(ROOT_DIR, file)
    const lineCount = countLines(fullPath)
    return { file, lines: lineCount }
  })
  
  // Sort by line count (descending)
  filesWithLines.sort((a, b) => b.lines - a.lines)
  
  return filesWithLines
}

/**
 * Main function
 */
function getOvercomplicationData() {
  const allowlist = loadAllowlist()
  const maxLines = allowlist.maxLines
  const allowlistCount = allowlist.files.size
  const gatePassed = checkGatePassed()
  
  const allFiles = getAllSourceFiles()
  const top10 = allFiles.slice(0, 10).map(({ file, lines }) => ({ file, lines }))
  
  return {
    maxLines,
    gatePassed,
    allowlistCount,
    top10
  }
}

// Output JSON to stdout
const data = getOvercomplicationData()
console.log(JSON.stringify(data, null, 2))
