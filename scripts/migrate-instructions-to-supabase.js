#!/usr/bin/env node

/**
 * Migration script to move instruction files from .cursor/rules/ to Supabase
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') })
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const RULES_DIR = path.join(__dirname, '..', '.cursor', 'rules')
const INDEX_FILE = path.join(RULES_DIR, '.instructions-index.json')

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
const REPO_FULL_NAME = process.env.REPO_FULL_NAME || 'beardedphil/portfolio-2026-hal'

// Use service role key if available (for migrations), otherwise use anon key
const supabaseKey = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY

if (!SUPABASE_URL || !supabaseKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY) must be set in .env')
  console.error('   Set VITE_SUPABASE_URL or SUPABASE_URL')
  console.error('   Set VITE_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, supabaseKey)

function parseInstructionFile(filePath, content) {
  const filename = path.basename(filePath)
  const topicId = filename.replace('.mdc', '')
  
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
    topicId,
    filename,
    title: filename.replace('.mdc', '').replace(/-/g, ' '),
    description: frontmatter.description || 'No description',
    contentMd: content,
    contentBody: body,
    alwaysApply: frontmatter.alwaysApply === 'true',
    agentTypes: agentTypes.length > 0 ? agentTypes : ['all'],
  }
}

async function migrateInstructions() {
  try {
    console.log('Starting migration of instructions to Supabase...')
    console.log(`Repo: ${REPO_FULL_NAME}`)
    console.log(`Supabase URL: ${SUPABASE_URL}`)

    // Load instruction index
    let instructionIndex = { basic: [], situational: {}, topics: {} }
    if (fs.existsSync(INDEX_FILE)) {
      try {
        const indexContent = fs.readFileSync(INDEX_FILE, 'utf-8')
        instructionIndex = JSON.parse(indexContent)
        console.log('✓ Loaded instruction index')
      } catch (err) {
        console.warn(`Warning: Could not load instruction index: ${err.message}`)
      }
    }

    // Read all .mdc files
    const files = fs.readdirSync(RULES_DIR).filter(f => f.endsWith('.mdc') && !f.startsWith('.'))
    console.log(`Found ${files.length} instruction files`)

    const instructions = []
    
    for (const file of files) {
      const filePath = path.join(RULES_DIR, file)
      try {
        const content = fs.readFileSync(filePath, 'utf-8')
        const parsed = parseInstructionFile(filePath, content)
        const topicId = parsed.topicId
        
        // Determine if basic or situational
        const isBasic = instructionIndex.basic?.includes(topicId) || false
        const isSituational = !isBasic && instructionIndex.topics?.[topicId] !== undefined
        
        // Get topic metadata
        const topicMetadata = instructionIndex.topics?.[topicId] || null

        instructions.push({
          repo_full_name: REPO_FULL_NAME,
          topic_id: topicId,
          filename: parsed.filename,
          title: parsed.title,
          description: parsed.description,
          content_md: parsed.contentMd,
          content_body: parsed.contentBody,
          always_apply: parsed.alwaysApply,
          agent_types: parsed.agentTypes,
          is_basic: isBasic,
          is_situational: isSituational,
          topic_metadata: topicMetadata,
        })
      } catch (err) {
        console.warn(`Warning: Could not process ${file}:`, err.message)
      }
    }

    console.log(`\nMigrating ${instructions.length} instructions...`)

    // Upsert instructions (use topic_id + repo_full_name as unique key)
    for (const instruction of instructions) {
      const { error } = await supabase
        .from('agent_instructions')
        .upsert(instruction, {
          onConflict: 'repo_full_name,topic_id',
        })

      if (error) {
        console.error(`Error migrating ${instruction.filename}:`, error.message)
      } else {
        console.log(`✓ ${instruction.filename}`)
      }
    }

    // Upsert instruction index
    if (Object.keys(instructionIndex).length > 0) {
      const { error: indexError } = await supabase
        .from('agent_instruction_index')
        .upsert({
          repo_full_name: REPO_FULL_NAME,
          index_data: instructionIndex,
        }, {
          onConflict: 'repo_full_name',
        })

      if (indexError) {
        console.error('Error migrating instruction index:', indexError.message)
      } else {
        console.log('✓ Instruction index migrated')
      }
    }

    console.log('\n✓ Migration complete!')
    console.log(`\nNext steps:`)
    console.log(`1. Verify instructions in Supabase dashboard`)
    console.log(`2. Update viewer component to read from Supabase`)
    console.log(`3. Update agent loading code to read from Supabase`)
  } catch (err) {
    console.error('Migration failed:', err)
    process.exit(1)
  }
}

migrateInstructions()
