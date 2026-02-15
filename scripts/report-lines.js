#!/usr/bin/env node

/**
 * Reports source code files exceeding 250 lines, sorted by line count.
 * Targets source directories (src/, api/, agents/, scripts/, projects/.../src)
 * and excludes generated/vendor output (dist/, build/, node_modules/).
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const ROOT_DIR = path.join(__dirname, '..')
const MAX_LINES = 250

// Source directories to include
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
 * Main function
 */
function reportLongFiles() {
  const offenders = []
  
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
      
      if (lineCount > MAX_LINES) {
        offenders.push({ path: file, lines: lineCount })
      }
    }
  }
  
  // Sort by line count (descending)
  offenders.sort((a, b) => b.lines - a.lines)
  
  // Print results
  if (offenders.length === 0) {
    console.log(`✓ No source files exceed ${MAX_LINES} lines.`)
    return
  }
  
  console.log(`Found ${offenders.length} source file(s) exceeding ${MAX_LINES} lines:\n`)
  console.log('Lines | Path')
  console.log('------|' + '-'.repeat(60))
  
  for (const offender of offenders) {
    console.log(`${String(offender.lines).padStart(5)} | ${offender.path}`)
  }
  
  console.log(`\nTotal: ${offenders.length} file(s)`)
}

// Run the report
reportLongFiles()

// Exit with code 0 (non-blocking)
process.exit(0)
