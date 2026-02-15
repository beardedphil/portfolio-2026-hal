#!/usr/bin/env node

/**
 * Generates overcomplication data for QA reports.
 * Outputs: max allowed lines, gate pass status, allowlist count, and top 10 largest files.
 * 
 * This script is designed to be run by QA agents to populate the Overcomplication section
 * of QA reports. It uses the same logic as check-lines.js and report-lines.js to ensure
 * consistency with the repository's line-limit tooling.
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
    throw new Error(`Allowlist file not found: ${ALLOWLIST_PATH}`)
  }
  
  try {
    const content = fs.readFileSync(ALLOWLIST_PATH, 'utf-8')
    const data = JSON.parse(content)
    
    return {
      maxLines: data.maxLines || 250,
      files: Array.isArray(data.files) ? data.files : []
    }
  } catch (err) {
    throw new Error(`Error reading allowlist: ${err.message}`)
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
 * Check if line limit gate passes
 */
function checkGatePasses() {
  try {
    execSync('npm run check:lines', { 
      cwd: ROOT_DIR, 
      stdio: 'pipe' 
    })
    return true
  } catch (err) {
    return false
  }
}

/**
 * Get all source files with line counts, sorted by line count (descending)
 */
function getAllFilesWithLineCounts() {
  const allFiles = []
  
  // Find all source files in source directories
  for (const sourceDir of SOURCE_DIRS) {
    const dirPath = path.join(ROOT_DIR, sourceDir)
    
    if (!fs.existsSync(dirPath)) {
      continue
    }
    
    const files = findSourceFiles(dirPath, sourceDir)
    
    for (const file of files) {
      const fullPath = path.join(ROOT_DIR, file)
      const lineCount = countLines(fullPath)
      allFiles.push({ path: file, lines: lineCount })
    }
  }
  
  // Sort by line count (descending)
  allFiles.sort((a, b) => b.lines - a.lines)
  
  return allFiles
}

/**
 * Main function
 */
function generateOvercomplicationReport() {
  const allowlist = loadAllowlist()
  const gatePasses = checkGatePasses()
  const allFiles = getAllFilesWithLineCounts()
  const top10Files = allFiles.slice(0, 10)
  
  // Output as JSON for easy parsing
  const report = {
    maxAllowedLines: allowlist.maxLines,
    gatePasses: gatePasses,
    allowlistedFileCount: allowlist.files.length,
    top10LargestFiles: top10Files.map(f => ({
      path: f.path,
      lines: f.lines
    }))
  }
  
  console.log(JSON.stringify(report, null, 2))
}

// Run the report
try {
  generateOvercomplicationReport()
} catch (err) {
  console.error(`Error generating overcomplication report: ${err.message}`)
  process.exit(1)
}
