#!/usr/bin/env node

/**
 * Migration script to move process documentation from docs/process/ to Supabase
 * as instruction topics with proper agent type scoping
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

const PROCESS_DOCS_DIR = path.join(__dirname, '..', 'docs', 'process')
const REPO_FULL_NAME = process.env.REPO_FULL_NAME || 'beardedphil/portfolio-2026-hal'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY

// Use service role key if available (for migrations), otherwise use anon key
const supabaseKey = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY

if (!SUPABASE_URL || !supabaseKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY) must be set in .env')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, supabaseKey)

/**
 * Determine agent types for a process doc based on filename and content
 */
function determineAgentTypes(filename, content) {
  const contentLower = content.toLowerCase()
  const filenameLower = filename.toLowerCase()
  const agentTypes = new Set()

  // Check for "all agents" indicators
  if (
    contentLower.includes('all agent') ||
    contentLower.includes('all agents') ||
    filenameLower.includes('hal-tool-call-contract') ||
    filenameLower.includes('agent-supabase-api-paradigm') ||
    filenameLower.includes('single-source-agents')
  ) {
    agentTypes.add('all')
  }

  // PM-specific
  if (
    contentLower.includes('pm agent') ||
    contentLower.includes('project manager') ||
    contentLower.includes('project-manager') ||
    filenameLower.includes('pm-handoff') ||
    filenameLower.includes('ready-to-start-checklist')
  ) {
    agentTypes.add('project-manager')
  }

  // QA-specific
  if (
    contentLower.includes('qa agent') ||
    contentLower.includes('qa-agent') ||
    filenameLower.includes('qa-agent') ||
    filenameLower.includes('ticket-verification-rules')
  ) {
    agentTypes.add('qa-agent')
  }

  // Implementation-specific
  if (
    contentLower.includes('implementation agent') ||
    contentLower.includes('implementation-agent') ||
    filenameLower.includes('implementation')
  ) {
    agentTypes.add('implementation-agent')
  }

  // Process Review-specific
  if (
    contentLower.includes('process review') ||
    contentLower.includes('process-review') ||
    filenameLower.includes('process-review')
  ) {
    agentTypes.add('process-review-agent')
  }

  // If no specific agent types found, default to 'all' (shared/global)
  if (agentTypes.size === 0) {
    agentTypes.add('all')
  }

  return Array.from(agentTypes)
}

/**
 * Determine if instruction is basic (always loaded) or situational (on-demand)
 */
function determineInstructionType(filename, content) {
  const contentLower = content.toLowerCase()
  const filenameLower = filename.toLowerCase()

  // Basic instructions are core process docs that should always be loaded
  const basicIndicators = [
    'hal-tool-call-contract',
    'agent-supabase-api-paradigm',
    'ready-to-start-checklist',
    'ticket-verification-rules',
    'single-source-agents',
  ]

  if (basicIndicators.some(indicator => filenameLower.includes(indicator))) {
    return { isBasic: true, isSituational: false }
  }

  // Situational instructions are specific procedures that can be requested on-demand
  const situationalIndicators = [
    'staging-test',
    'smoke-test',
    'migration',
    'procedure',
  ]

  if (situationalIndicators.some(indicator => filenameLower.includes(indicator))) {
    return { isBasic: false, isSituational: true }
  }

  // Default: basic for core process docs
  return { isBasic: true, isSituational: false }
}

/**
 * Parse a process doc file and extract metadata
 */
function parseProcessDoc(filePath, content) {
  const filename = path.basename(filePath)
  const relativePath = path.relative(PROCESS_DOCS_DIR, filePath)
  
  // Generate topic ID from filename (remove extension, use path for uniqueness if in subdirectory)
  let topicId = filename.replace(/\.(md|mdc)$/, '')
  if (relativePath !== filename) {
    // Include subdirectory in topic ID for uniqueness
    const dir = path.dirname(relativePath)
    if (dir !== '.') {
      topicId = `${dir.replace(/\//g, '-')}-${topicId}`
    }
  }
  topicId = topicId.replace(/[^a-z0-9-]/gi, '-').toLowerCase()

  // Extract title from first heading or filename
  const titleMatch = content.match(/^#\s+(.+)$/m)
  const title = titleMatch ? titleMatch[1].trim() : filename.replace(/\.(md|mdc)$/, '').replace(/-/g, ' ')

  // Extract description from first paragraph or frontmatter
  let description = 'No description'
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/)
  if (frontmatterMatch) {
    const frontmatter = frontmatterMatch[1]
    const descMatch = frontmatter.match(/^description:\s*(.+)$/m)
    if (descMatch) {
      description = descMatch[1].trim().replace(/^["']|["']$/g, '')
    }
  } else {
    // Try to extract from first paragraph
    const firstParaMatch = content.match(/^#\s+[^\n]+\n\n([^\n]+)/)
    if (firstParaMatch) {
      description = firstParaMatch[1].trim()
    }
  }

  const agentTypes = determineAgentTypes(filename, content)
  const { isBasic, isSituational } = determineInstructionType(filename, content)

  return {
    topicId,
    filename,
    title,
    description,
    contentMd: content,
    contentBody: content, // For process docs, body is same as full content
    alwaysApply: agentTypes.includes('all'),
    agentTypes,
    isBasic,
    isSituational,
    originalPath: relativePath,
  }
}

/**
 * Recursively find all markdown files in docs/process
 */
function findProcessDocs(dir, fileList = []) {
  const files = fs.readdirSync(dir)

  for (const file of files) {
    const filePath = path.join(dir, file)
    const stat = fs.statSync(filePath)

    if (stat.isDirectory()) {
      // Skip supabase-migrations subdirectory (those are SQL migrations, not process docs)
      if (file !== 'supabase-migrations') {
        findProcessDocs(filePath, fileList)
      }
    } else if (file.match(/\.(md|mdc)$/)) {
      fileList.push(filePath)
    }
  }

  return fileList
}

/**
 * Main migration function
 */
async function migrateProcessDocs() {
  try {
    console.log('Starting migration of process docs to Supabase...')
    console.log(`Repo: ${REPO_FULL_NAME}`)
    console.log(`Process docs directory: ${PROCESS_DOCS_DIR}`)

    if (!fs.existsSync(PROCESS_DOCS_DIR)) {
      console.error(`Error: Process docs directory not found: ${PROCESS_DOCS_DIR}`)
      process.exit(1)
    }

    // Find all process doc files
    const files = findProcessDocs(PROCESS_DOCS_DIR)
    console.log(`Found ${files.length} process doc files\n`)

    const instructions = []
    const migrationMapping = []

    for (const filePath of files) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8')
        const parsed = parseProcessDoc(filePath, content)
        
        instructions.push({
          repo_full_name: REPO_FULL_NAME,
          topic_id: parsed.topicId,
          filename: parsed.filename,
          title: parsed.title,
          description: parsed.description,
          content_md: parsed.contentMd,
          content_body: parsed.contentBody,
          always_apply: parsed.alwaysApply,
          agent_types: parsed.agentTypes,
          is_basic: parsed.isBasic,
          is_situational: parsed.isSituational,
          topic_metadata: {
            originalPath: parsed.originalPath,
            migratedFrom: 'docs/process',
            migratedAt: new Date().toISOString(),
          },
        })

        migrationMapping.push({
          originalPath: parsed.originalPath,
          topicId: parsed.topicId,
          title: parsed.title,
          agentTypes: parsed.agentTypes,
          isBasic: parsed.isBasic,
          isSituational: parsed.isSituational,
        })

        console.log(`✓ ${parsed.originalPath} → ${parsed.topicId} (${parsed.agentTypes.join(', ')})`)
      } catch (err) {
        console.error(`Error processing ${filePath}:`, err.message)
      }
    }

    console.log(`\nMigrating ${instructions.length} instructions to Supabase...\n`)

    // Upsert instructions
    let successCount = 0
    let failCount = 0
    for (const instruction of instructions) {
      const { error } = await supabase
        .from('agent_instructions')
        .upsert(instruction, {
          onConflict: 'repo_full_name,topic_id',
        })

      if (error) {
        console.error(`✗ Error migrating ${instruction.filename}:`, error.message)
        failCount++
      } else {
        successCount++
      }
    }

    // Create migration mapping document as an instruction topic
    const mappingContent = `# Process Docs Migration Mapping

This document maps all process documentation files from \`docs/process/\` to their corresponding instruction topics in Supabase.

**Migration Date:** ${new Date().toISOString()}
**Repo:** ${REPO_FULL_NAME}

## Migration Summary

- **Total files migrated:** ${instructions.length}
- **Successfully migrated:** ${successCount}
- **Failed:** ${failCount}

## File Mapping

| Original Path | Topic ID | Title | Agent Types | Type |
|--------------|----------|-------|-------------|------|
${migrationMapping.map(m => `| \`${m.originalPath}\` | \`${m.topicId}\` | ${m.title} | ${m.agentTypes.join(', ')} | ${m.isBasic ? 'Basic' : m.isSituational ? 'Situational' : 'Basic'}`).join('\n')}

## Agent Type Scoping

- **all**: Instructions that apply to all agent types (shared/global)
- **project-manager**: Instructions specific to PM agents
- **qa-agent**: Instructions specific to QA agents
- **implementation-agent**: Instructions specific to Implementation agents
- **process-review-agent**: Instructions specific to Process Review agents

## Instruction Types

- **Basic**: Always loaded for the relevant agent types
- **Situational**: Available on-demand via topic ID

## Notes

- All process documentation has been migrated from \`docs/process/\` to Supabase
- Instructions are now retrieved via HAL API endpoints with agent type scoping
- The original files in \`docs/process/\` can be kept for reference but are no longer the source of truth
`

    // Store migration mapping as an instruction topic
    const mappingInstruction = {
      repo_full_name: REPO_FULL_NAME,
      topic_id: 'process-docs-migration-mapping',
      filename: 'process-docs-migration-mapping.mdc',
      title: 'Process Docs Migration Mapping',
      description: 'Mapping of all process documentation files migrated from docs/process/ to Supabase instruction topics',
      content_md: mappingContent,
      content_body: mappingContent,
      always_apply: true,
      agent_types: ['all'],
      is_basic: true,
      is_situational: false,
      topic_metadata: {
        migratedAt: new Date().toISOString(),
        migrationType: 'process-docs',
      },
    }

    const { error: mappingError } = await supabase
      .from('agent_instructions')
      .upsert(mappingInstruction, {
        onConflict: 'repo_full_name,topic_id',
      })

    if (mappingError) {
      console.error('Error storing migration mapping:', mappingError.message)
    } else {
      console.log('✓ Migration mapping document stored')
    }

    console.log(`\n✓ Migration complete!`)
    console.log(`\nSummary:`)
    console.log(`  - Successfully migrated: ${successCount}`)
    console.log(`  - Failed: ${failCount}`)
    console.log(`  - Migration mapping stored as topic: process-docs-migration-mapping`)
    console.log(`\nNext steps:`)
    console.log(`1. Verify instructions in Supabase dashboard`)
    console.log(`2. Test agent type scoping in HAL app`)
    console.log(`3. Update API endpoints to enforce scoping`)
  } catch (err) {
    console.error('Migration failed:', err)
    process.exit(1)
  }
}

migrateProcessDocs()
