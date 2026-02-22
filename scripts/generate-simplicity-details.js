#!/usr/bin/env node
/**
 * Generate simplicity-details.json with maintainability metrics.
 * Calculates maintainability based on code structure analysis.
 */

import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const repoRoot = join(__dirname, '..')

function calculateMaintainability(sourceCode) {
  // Simple maintainability metric based on code structure
  // Factors:
  // 1. Function length (shorter = better)
  // 2. Cyclomatic complexity (lower = better)
  // 3. Code organization (extracted functions = better)
  
  const lines = sourceCode.split('\n')
  const totalLines = lines.length
  
  // Count functions
  const functionMatches = sourceCode.match(/(?:function|const|export\s+(?:async\s+)?function)\s+\w+/g) || []
  const functionCount = functionMatches.length
  
  // Count nested structures (if/else, loops, etc.) as complexity indicators
  const ifMatches = sourceCode.match(/\bif\s*\(/g) || []
  const forMatches = sourceCode.match(/\bfor\s*\(/g) || []
  const whileMatches = sourceCode.match(/\bwhile\s*\(/g) || []
  const switchMatches = sourceCode.match(/\bswitch\s*\(/g) || []
  const complexity = ifMatches.length + forMatches.length + whileMatches.length + switchMatches.length
  
  // Count extracted helper functions (functions with simple names, likely helpers)
  const helperFunctionPattern = /(?:function|const)\s+(\w+)\s*[=:]/g
  const helperFunctions = []
  let match
  while ((match = helperFunctionPattern.exec(sourceCode)) !== null) {
    const funcName = match[1]
    // Simple heuristic: short names, starts with lowercase, likely helpers
    if (funcName.length < 20 && /^[a-z]/.test(funcName)) {
      helperFunctions.push(funcName)
    }
  }
  const helperCount = helperFunctions.length
  
  // Calculate maintainability score (0-100)
  // Higher score = better maintainability
  // Factors:
  // - More helper functions = better (up to a point)
  // - Lower complexity per function = better
  // - Reasonable function count = better
  
  const avgComplexityPerFunction = functionCount > 0 ? complexity / functionCount : complexity
  const helperRatio = functionCount > 0 ? helperCount / functionCount : 0
  
  // Base score from helper extraction (refactoring benefit)
  let score = Math.min(50, helperCount * 5)
  
  // Bonus for low complexity
  if (avgComplexityPerFunction < 3) {
    score += 20
  } else if (avgComplexityPerFunction < 5) {
    score += 10
  }
  
  // Bonus for good function organization
  if (helperRatio > 0.3) {
    score += 20
  } else if (helperRatio > 0.2) {
    score += 10
  }
  
  // Cap at 100
  score = Math.min(100, Math.max(0, score))
  
  return {
    maintainability: Math.round(score * 10) / 10, // Round to 1 decimal
    complexity: complexity,
    functionCount: functionCount,
    helperFunctionCount: helperCount,
  }
}

try {
  const filePath = join(repoRoot, 'projects/hal-agents/src/agents/projectManager.ts')
  const sourceCode = readFileSync(filePath, 'utf8')
  
  const metrics = calculateMaintainability(sourceCode)
  
  const simplicityDetails = {
    'agents/src/agents/projectManager.ts': {
      maintainability: metrics.maintainability,
      complexity: metrics.complexity,
      functionCount: metrics.functionCount,
      helperFunctionCount: metrics.helperFunctionCount,
      generatedAt: new Date().toISOString(),
    },
  }

  const outputPath = join(repoRoot, 'public', 'simplicity-details.json')
  writeFileSync(outputPath, JSON.stringify(simplicityDetails, null, 2))
  console.log(`Generated ${outputPath}`)
  console.log(`Maintainability for projectManager.ts: ${metrics.maintainability}`)
  console.log(`Complexity: ${metrics.complexity}, Functions: ${metrics.functionCount}, Helpers: ${metrics.helperFunctionCount}`)
} catch (error) {
  console.error('Error generating simplicity details:', error.message)
  // Write default if generation fails
  const defaultDetails = {
    'agents/src/agents/projectManager.ts': {
      maintainability: 0,
      complexity: 0,
      generatedAt: new Date().toISOString(),
    },
  }
  const outputPath = join(repoRoot, 'public', 'simplicity-details.json')
  writeFileSync(outputPath, JSON.stringify(defaultDetails, null, 2))
  process.exit(1)
}
