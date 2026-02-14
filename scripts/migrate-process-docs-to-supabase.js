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

/**
 * Determine agent types for a process doc based on filename and content
 */
function determineAgentTypes(filename, content) {
  const agentTypes = []
  const contentLower = content.toLowerCase()
  const filenameLower = filename.toLowerCase()
  
  // Check for explicit agent mentions in content
  const hasQA = contentLower.includes('qa agent') || contentLower.includes('qa-agent') || 
                filenameLower.includes('qa') || contentLower.includes('qa report')
  const hasImplementation = contentLower.includes('implementation agent') || 
                           contentLower.includes('implementation-agent') ||
                           contentLower.includes('implementation:') ||
                           contentLower.includes('implementation agent')
  const hasPM = contentLower.includes('project manager') || 
               contentLower.includes('project-manager') || 
               contentLower.includes('pm agent') ||
               filenameLower.includes('pm-') ||
               contentLower.includes('pm agent')
  const hasProcessReview = contentLower.includes('process review') || 
                          contentLower.includes('process-review') ||
                          filenameLower.includes('process-review')
  
  // Check for "all agents" indicators
  const hasAllAgents = contentLower.includes('all agent') || 
                       contentLower.includes('all agents') ||
                       contentLower.includes('every agent') ||
                       contentLower.includes('any agent')
  
  // Specific file-based rules
  if (filename === 'ready-to-start-checklist.md') {
    // Applies to all agents (PM checks before moving, agents check before starting)
    agentTypes.push('all')
  } else if (filename === 'pm-handoff.md') {
    agentTypes.push('project-manager')
  } else if (filename === 'ticket-verification-rules.md') {
    // Applies to QA and PM (verification rules)
    agentTypes.push('qa-agent')
    agentTypes.push('project-manager')
  } else if (filename === 'qa-agent-supabase-tools.md') {
    agentTypes.push('qa-agent')
    agentTypes.push('implementation-agent') // Implementation agents also use these tools
  } else if (filename === 'agent-supabase-api-paradigm.mdc') {
    // Applies to all agents (all use HAL API)
    agentTypes.push('all')
  } else if (filename === 'hal-tool-call-contract.mdc') {
    // Applies to all agents (all use tool calls)
    agentTypes.push('all')
  } else if (filename === 'chat-ui-staging-test-procedure.mdc') {
    // Applies to Implementation and QA (they run staging tests)
    agentTypes.push('implementation-agent')
    agentTypes.push('qa-agent')
  } else {
    // Content-based detection
    if (hasAllAgents) {
      agentTypes.push('all')
    } else {
      if (hasQA) agentTypes.push('qa-agent')
      if (hasImplementation) agentTypes.push('implementation-agent')
      if (hasPM) agentTypes.push('project-manager')
      if (hasProcessReview) agentTypes.push('process-review-agent')
    }
  }
  
  // If no agent types found, default to 'all' (shared/global)
  if (agentTypes.length === 0) {
    agentTypes.push('all')
  }
  
  return [...new Set(agentTypes)] // Remove duplicates
}

/**
 * Generate topic ID from filename
 */
function generateTopicId(filename) {
  // Remove extension and convert to kebab-case
  const base = filename.replace(/\.(md|mdc)$/, '')
  return base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/**
 * Generate title from filename
 */
function generateTitle(filename) {
  const base = filename.replace(/\.(md|mdc)$/, '')
  return base.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

/**
 * Parse process doc file
 */
function parseProcessDoc(filePath, content) {
  const filename = path.basename(filePath)
  const topicId = generateTopicId(filename)
  
  // Parse frontmatter if present
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

  // Determine agent types
  const agentTypes = determineAgentTypes(filename, content)
  
  // Determine if this is a shared/global instruction (applies to all)
  const alwaysApply = agentTypes.includes('all')
  
  // Extract description from first paragraph or frontmatter
  let description = frontmatter.description || 'No description'
  if (description === 'No description') {
    // Try to extract from first paragraph
    const firstParagraph = body.split('\n\n').find(p => p.trim().length > 0)
    if (firstParagraph) {
      description = firstParagraph.trim().substring(0, 200)
      if (description.length === 200) description += '...'
    }
  }

  return {
    topicId,
    filename,
    title: frontmatter.title || generateTitle(filename),
    description,
    contentMd: content,
    contentBody: body,
    alwaysApply,
    agentTypes,
  }
}

/**
 * Main migration function
 */
async function migrateProcessDocs() {
  try {
    console.log('Starting migration of process docs to Supabase...')
    console.log(`Repo: ${REPO_FULL_NAME}`)
    console.log(`Supabase URL: ${SUPABASE_URL}`)
    console.log(`Process docs directory: ${PROCESS_DOCS_DIR}`)

    if (!fs.existsSync(PROCESS_DOCS_DIR)) {
      console.error(`Error: Process docs directory not found: ${PROCESS_DOCS_DIR}`)
      process.exit(1)
    }

    // Read all .md and .mdc files (excluding subdirectories for now)
    const files = fs.readdirSync(PROCESS_DOCS_DIR)
      .filter(f => (f.endsWith('.md') || f.endsWith('.mdc')) && !f.startsWith('.'))
      .filter(f => {
        const filePath = path.join(PROCESS_DOCS_DIR, f)
        return fs.statSync(filePath).isFile()
      })
    
    console.log(`Found ${files.length} process doc files`)

    const instructions = []
    const migrationMapping = []
    
    for (const file of files) {
      const filePath = path.join(PROCESS_DOCS_DIR, file)
      try {
        const content = fs.readFileSync(filePath, 'utf-8')
        const parsed = parseProcessDoc(filePath, content)
        
        // Determine if basic or situational
        // Process docs are typically situational (on-demand) unless they're core workflow
        const isBasic = parsed.alwaysApply && parsed.agentTypes.includes('all')
        const isSituational = !isBasic
        
        // Build topic metadata
        const topicMetadata = {
          title: parsed.title,
          description: parsed.description,
          agentTypes: parsed.agentTypes,
          keywords: [parsed.topicId, ...parsed.agentTypes],
        }

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
          is_basic: isBasic,
          is_situational: isSituational,
          topic_metadata: topicMetadata,
        })
        
        migrationMapping.push({
          sourceFile: `docs/process/${file}`,
          topicId: parsed.topicId,
          title: parsed.title,
          agentTypes: parsed.agentTypes,
          isBasic,
          isSituational,
        })
        
        console.log(`✓ Processed: ${file} → ${parsed.topicId} (${parsed.agentTypes.join(', ')})`)
      } catch (err) {
        console.error(`Error processing ${file}:`, err.message)
      }
    }

    console.log(`\nMigrating ${instructions.length} instructions to Supabase...`)

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
        console.log(`✓ Migrated: ${instruction.filename}`)
        successCount++
      }
    }

    // Create migration mapping document as an instruction topic
    const mappingContent = `# Process Docs Migration Mapping

This document maps each file from \`docs/process/\` to its corresponding instruction topic in Supabase.

## Migration Date
${new Date().toISOString()}

## Mapping

| Source File | Topic ID | Title | Agent Types | Type |
|------------|----------|-------|-------------|------|
${migrationMapping.map(m => 
  `| \`${m.sourceFile}\` | \`${m.topicId}\` | ${m.title} | ${m.agentTypes.join(', ')} | ${m.isBasic ? 'Basic' : 'Situational'} |`
).join('\n')}

## Notes

- All process docs have been migrated to Supabase as instruction topics
- Agent types determine which agents receive each instruction by default
- Instructions marked as "all" are shared/global and included for every agent type
- Basic instructions are always loaded; situational instructions are on-demand
- To access a specific topic, use: \`POST /api/instructions/get-topic\` with \`topicId\`

## Verification

To verify the migration:
1. Query Supabase \`agent_instructions\` table for \`repo_full_name = '${REPO_FULL_NAME}'\`
2. Check that all topic IDs listed above exist
3. Verify agent type scoping by querying with different \`agentType\` values
`

    // Store migration mapping as an instruction topic
    const mappingTopicId = 'process-docs-migration-mapping'
    const mappingInstruction = {
      repo_full_name: REPO_FULL_NAME,
      topic_id: mappingTopicId,
      filename: 'process-docs-migration-mapping.mdc',
      title: 'Process Docs Migration Mapping',
      description: 'Mapping document listing each docs/process file and its destination topicId in Supabase',
      content_md: mappingContent,
      content_body: mappingContent,
      always_apply: true, // Available to all agents
      agent_types: ['all'],
      is_basic: false,
      is_situational: true,
      topic_metadata: {
        title: 'Process Docs Migration Mapping',
        description: 'Mapping document listing each docs/process file and its destination topicId in Supabase',
        agentTypes: ['all'],
        keywords: ['migration', 'mapping', 'process-docs'],
      },
    }

    const { error: mappingError } = await supabase
      .from('agent_instructions')
      .upsert(mappingInstruction, {
        onConflict: 'repo_full_name,topic_id',
      })

    if (mappingError) {
      console.error('✗ Error storing migration mapping:', mappingError.message)
    } else {
      console.log('✓ Stored migration mapping document')
    }

    // Also save mapping to a local file for reference
    const mappingFilePath = path.join(__dirname, '..', 'docs', 'process', 'MIGRATION_MAPPING.md')
    fs.writeFileSync(mappingFilePath, mappingContent, 'utf-8')
    console.log(`✓ Saved migration mapping to: ${mappingFilePath}`)

    console.log('\n✓ Migration complete!')
    console.log(`\nSummary:`)
    console.log(`  - Migrated: ${successCount}`)
    console.log(`  - Failed: ${failCount}`)
    console.log(`  - Total: ${instructions.length}`)
    console.log(`\nNext steps:`)
    console.log(`1. Verify instructions in Supabase dashboard`)
    console.log(`2. Test instruction retrieval with different agent types`)
    console.log(`3. Update HAL app to show agent-specific instructions`)
  } catch (err) {
    console.error('Migration failed:', err)
    process.exit(1)
  }
}

migrateProcessDocs()
