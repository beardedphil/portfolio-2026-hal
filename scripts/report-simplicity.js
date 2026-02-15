#!/usr/bin/env node

/**
 * Reports simplicity metrics for QA reports:
 * - Max allowed lines (from allowlist)
 * - Whether the gate passed
 * - Count of allowlisted files
 * - Top 10 largest source files with line counts
 * 
 * Outputs markdown format suitable for inclusion in QA reports.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const ROOT_DIR = path.join(__dirname, '..')
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
    console.error(`Error: Allowlist file not found: ${ALLOWLIST_PATH}`)
    process.exit(1)
  }
  
  try {
    const content = fs.readFileSync(ALLOWLIST_PATH, 'utf-8')
    const data = JSON.parse(content)
    
    return {
      maxLines: data.maxLines || 250,
      files: Array.isArray(data.files) ? data.files : []
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
 * Check if line limit gate passed
 */
function checkGatePassed() {
  try {
    // Run check:lines and capture exit code
    execSync('npm run check:lines', { 
      cwd: ROOT_DIR,
      stdio: 'pipe' // Suppress output
    })
    return true
  } catch (err) {
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
  
  // Count lines for each file
  const filesWithCounts = allFiles.map(file => {
    const fullPath = path.join(ROOT_DIR, file)
    return {
      path: file,
      lines: countLines(fullPath)
    }
  })
  
  // Sort by line count (descending)
  filesWithCounts.sort((a, b) => b.lines - a.lines)
  
  return filesWithCounts
}

/**
 * Main function
 */
function reportSimplicity() {
  const allowlist = loadAllowlist()
  const maxLines = allowlist.maxLines
  const allowlistCount = allowlist.files.length
  const gatePassed = checkGatePassed()
  const allFiles = getAllSourceFiles()
  const top10 = allFiles.slice(0, 10)
  
  // Output markdown format
  console.log('## Simplicity')
  console.log('')
  console.log(`**Max allowed lines:** ${maxLines}`)
  console.log(`**Gate passed:** ${gatePassed ? '✅ Yes' : '❌ No'}`)
  console.log(`**Allowlisted files:** ${allowlistCount}`)
  console.log('')
  console.log('**Top 10 largest source files:**')
  console.log('')
  console.log('| Lines | Path |')
  console.log('|-------|------|')
  
  for (const file of top10) {
    console.log(`| ${file.lines} | \`${file.path}\` |`)
  }
}

// Run the report
reportSimplicity()
