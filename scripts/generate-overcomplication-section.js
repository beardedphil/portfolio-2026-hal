#!/usr/bin/env node

/**
 * Generates the "Overcomplication" section for QA reports.
 * 
 * This script:
 * 1. Reads the line-limit allowlist to get max allowed lines and count of allowlisted files
 * 2. Checks all source files to determine if the gate passed
 * 3. Gets the top 10 largest source files by line count
 * 4. Outputs markdown formatted section ready to include in QA reports
 * 
 * Usage: node scripts/generate-overcomplication-section.js
 * 
 * QA agents should run this command and include the output in their QA reports.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const ROOT_DIR = path.join(__dirname, '..')
const ALLOWLIST_PATH = path.join(ROOT_DIR, '.line-limit-allowlist.json')

// Source directories to include (same as check-lines.js and report-lines.js)
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
      maxLines: data.maxLines || 250,
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
 * Check line limits and collect file information
 */
function analyzeFiles() {
  const allowlist = loadAllowlist()
  const maxLines = allowlist.maxLines
  const violations = []
  const allFileData = []
  
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
  
  // Check each file and collect data
  for (const file of allFiles) {
    const fullPath = path.join(ROOT_DIR, file)
    const lineCount = countLines(fullPath)
    const baseline = allowlist.files.get(file)
    
    allFileData.push({
      file,
      lines: lineCount,
      isAllowlisted: baseline !== undefined,
      baseline: baseline
    })
    
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
  
  // Sort all files by line count (descending) to get top 10
  allFileData.sort((a, b) => b.lines - a.lines)
  const top10 = allFileData.slice(0, 10)
  
  return {
    maxLines,
    allowlistCount: allowlist.files.size,
    gatePassed: violations.length === 0,
    violations,
    top10
  }
}

/**
 * Generate markdown section
 */
function generateMarkdown() {
  const analysis = analyzeFiles()
  
  const gateStatus = analysis.gatePassed ? '✅ PASS' : '❌ FAIL'
  const violationsCount = analysis.violations.length
  
  let markdown = `## Overcomplication\n\n`
  markdown += `**Max allowed lines:** ${analysis.maxLines}\n`
  markdown += `**Gate status:** ${gateStatus}\n`
  markdown += `**Allowlisted files:** ${analysis.allowlistCount}\n`
  
  if (violationsCount > 0) {
    markdown += `**Violations:** ${violationsCount} file(s) exceed limits\n\n`
  } else {
    markdown += `**Violations:** None\n\n`
  }
  
  markdown += `### Top 10 Largest Source Files\n\n`
  markdown += `| Lines | File | Allowlisted |\n`
  markdown += `|-------|------|-------------|\n`
  
  for (const fileData of analysis.top10) {
    const allowlistStatus = fileData.isAllowlisted 
      ? `Yes (baseline: ${fileData.baseline})` 
      : 'No'
    markdown += `| ${fileData.lines} | \`${fileData.file}\` | ${allowlistStatus} |\n`
  }
  
  return markdown
}

// Run and output
const markdown = generateMarkdown()
console.log(markdown)
