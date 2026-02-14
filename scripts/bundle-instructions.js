#!/usr/bin/env node

/**
 * Build-time script to bundle agent instruction files into a JSON file
 * that can be loaded by the AgentInstructionsViewer component.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const RULES_DIR = path.join(__dirname, '..', '.cursor', 'rules')
const OUTPUT_FILE = path.join(__dirname, '..', 'public', 'agent-instructions.json')

function parseInstructionFile(filePath, content) {
  const filename = path.basename(filePath)
  
  // Parse frontmatter
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/
  const match = content.match(frontmatterRegex)
  
  let frontmatter = {}
  let body = content

  if (match) {
    const frontmatterText = match[1]
    body = match[2]
    
    // Simple frontmatter parser
    for (const line of frontmatterText.split('\n')) {
      const colonIndex = line.indexOf(':')
      if (colonIndex > 0) {
        const key = line.slice(0, colonIndex).trim()
        let value = line.slice(colonIndex + 1).trim()
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1)
        }
        frontmatter[key] = value
      }
    }
  }

  // Determine agent types from content
  const agentTypes = []
  const contentLower = content.toLowerCase()
  
  if (frontmatter.alwaysApply === 'true') {
    agentTypes.push('all')
  }
  
  // Heuristic: check content for agent mentions
  if (contentLower.includes('qa agent') || contentLower.includes('qa-agent') || filename.includes('qa')) {
    agentTypes.push('qa-agent')
  }
  if (contentLower.includes('implementation agent') || contentLower.includes('implementation-agent')) {
    agentTypes.push('implementation-agent')
  }
  if (contentLower.includes('project manager') || contentLower.includes('project-manager') || contentLower.includes('pm agent')) {
    agentTypes.push('project-manager')
  }
  if (contentLower.includes('process review') || contentLower.includes('process-review')) {
    agentTypes.push('process-review-agent')
  }

  // If no specific agent types found but alwaysApply is true, it applies to all
  if (agentTypes.length === 0 && frontmatter.alwaysApply === 'true') {
    agentTypes.push('all')
  }

  return {
    path: filename,
    name: filename.replace('.mdc', '').replace(/-/g, ' '),
    description: frontmatter.description || 'No description',
    alwaysApply: frontmatter.alwaysApply === 'true',
    content: body,
    agentTypes: agentTypes.length > 0 ? agentTypes : ['all'],
  }
}

function bundleInstructions() {
  try {
    // Ensure public directory exists
    const publicDir = path.dirname(OUTPUT_FILE)
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true })
    }

    // Read all .mdc files from .cursor/rules/
    const files = fs.readdirSync(RULES_DIR).filter(f => f.endsWith('.mdc'))
    
    const instructions = []
    
    for (const file of files) {
      const filePath = path.join(RULES_DIR, file)
      try {
        const content = fs.readFileSync(filePath, 'utf-8')
        const parsed = parseInstructionFile(filePath, content)
        if (parsed) {
          instructions.push(parsed)
        }
      } catch (err) {
        console.warn(`Warning: Could not read ${file}:`, err.message)
      }
    }

    // Write bundled instructions to JSON file
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify({ instructions }, null, 2), 'utf-8')
    
    console.log(`✓ Bundled ${instructions.length} instruction files to ${OUTPUT_FILE}`)
  } catch (err) {
    console.error('Error bundling instructions:', err)
    process.exit(1)
  }
}

bundleInstructions()
