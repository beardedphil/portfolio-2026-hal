/**
 * Direct migration script that imports and calls the migration handler directly
 * (bypasses HTTP API, works without server running)
 * 
 * Usage: npx tsx scripts/migrate-process-docs-direct.ts
 */

import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

// Load environment variables
import { config } from 'dotenv'
config()

const REPO_FULL_NAME = 'beardedphil/portfolio-2026-hal'

// Get Supabase credentials
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_ANON_KEY must be set in environment')
  process.exit(1)
}

/**
 * Determine agent types for a process doc based on filename and content
 */
function determineAgentTypes(filename: string, content: string): string[] {
  const filenameLower = filename.toLowerCase()
  const contentLower = content.toLowerCase()
  const agentTypes: string[] = []

  // Check for explicit agent mentions in content
  if (contentLower.includes('qa agent') || contentLower.includes('qa-agent') || filenameLower.includes('qa')) {
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

  // Specific file-based rules for process docs
  if (filenameLower.includes('ready-to-start') || filenameLower.includes('ticket-verification')) {
    if (!agentTypes.includes('all')) agentTypes.push('all')
  } else if (filenameLower.includes('agent-supabase-api') || filenameLower.includes('hal-tool-call')) {
    if (!agentTypes.includes('all')) agentTypes.push('all')
  } else if (filenameLower.includes('chat-ui-staging') || filenameLower.includes('vercel-preview')) {
    if (!agentTypes.includes('implementation-agent')) agentTypes.push('implementation-agent')
    if (!agentTypes.includes('qa-agent')) agentTypes.push('qa-agent')
  } else if (filenameLower.includes('pm-handoff')) {
    if (!agentTypes.includes('project-manager')) agentTypes.push('project-manager')
  } else if (filenameLower.includes('single-source') || filenameLower.includes('split-repos') || filenameLower.includes('cloud-artifacts')) {
    if (!agentTypes.includes('project-manager')) agentTypes.push('project-manager')
    if (!agentTypes.includes('process-review-agent')) agentTypes.push('process-review-agent')
  } else if (filenameLower.includes('qa-agent')) {
    if (!agentTypes.includes('qa-agent')) agentTypes.push('qa-agent')
  }

  // If no specific agent types found, default to 'all' (shared/global)
  if (agentTypes.length === 0) {
    agentTypes.push('all')
  }

  return agentTypes
}

/**
 * Parse a process doc file and extract metadata
 */
function parseProcessDoc(filePath: string, content: string) {
  const filename = path.basename(filePath)
  const relativePath = path.relative(process.cwd(), filePath)
  
  // Generate topic ID from filename
  const topicId = filename
    .replace(/\.(md|mdc)$/, '')
    .replace(/[^a-z0-9-]/gi, '-')
    .toLowerCase()
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  
  // Parse frontmatter if present
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/
  const match = content.match(frontmatterRegex)
  
  let frontmatter: Record<string, string> = {}
  let body = content

  if (match) {
    const frontmatterText = match[1]
    body = match[2]
    
    for (const line of frontmatterText.split('\n')) {
      const colonIndex = line.indexOf(':')
      if (colonIndex > 0) {
        const key = line.slice(0, colonIndex).trim()
        let value = line.slice(colonIndex + 1).trim()
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1)
        }
        frontmatter[key] = value
      }
    }
  }

  // Determine agent types
  const agentTypes = determineAgentTypes(filename, content)
  const alwaysApply = agentTypes.includes('all') || frontmatter.alwaysApply === 'true'
  
  // Extract title
  const titleMatch = body.match(/^#+\s+(.+)$/m)
  const title = titleMatch 
    ? titleMatch[1].trim()
    : filename.replace(/\.(md|mdc)$/, '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  
  // Extract description
  const description = frontmatter.description || 
    body.split('\n\n').find(p => p.trim().length > 20 && !p.trim().startsWith('#'))?.slice(0, 200) ||
    'Process documentation'

  const normalizedAgentTypes = alwaysApply 
    ? ['all'] 
    : agentTypes.filter(t => t !== 'all').length > 0 
      ? agentTypes.filter(t => t !== 'all')
      : ['all']

  return {
    topicId,
    filename,
    title,
    description,
    contentMd: content,
    contentBody: body,
    alwaysApply,
    agentTypes: normalizedAgentTypes,
    relativePath,
  }
}

async function migrateProcessDocs() {
  console.log('Migrating process docs to Supabase...')
  console.log(`Repo: ${REPO_FULL_NAME}`)
  console.log(`Supabase URL: ${supabaseUrl}`)

  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  // Find docs/process directory
  const processDir = path.join(process.cwd(), 'docs', 'process')
  
  if (!fs.existsSync(processDir)) {
    console.error(`Error: Process docs directory not found: ${processDir}`)
    process.exit(1)
  }

  // Recursively find all .md and .mdc files
  const files: string[] = []
  function findFiles(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== 'supabase-migrations') {
          findFiles(fullPath)
        }
      } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.mdc'))) {
        files.push(fullPath)
      }
    }
  }
  
  findFiles(processDir)
  console.log(`Found ${files.length} process doc files\n`)

  const instructions = []
  const errors: string[] = []
  const migrationMapping: Array<{ sourceFile: string; topicId: string; title: string; agentTypes: string[] }> = []
  
  for (const filePath of files) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      const parsed = parseProcessDoc(filePath, content)
      
      const isBasic = false
      const isSituational = true
      
      const topicMetadata = {
        title: parsed.title,
        description: parsed.description,
        agentTypes: parsed.agentTypes,
        sourceFile: parsed.relativePath,
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
        sourceFile: parsed.relativePath,
        topicId: parsed.topicId,
        title: parsed.title,
        agentTypes: parsed.agentTypes,
      })

      console.log(`✓ Processed: ${parsed.filename} → ${parsed.topicId} (${parsed.agentTypes.join(', ')})`)
    } catch (err) {
      const errorMsg = `Error processing ${filePath}: ${err instanceof Error ? err.message : String(err)}`
      errors.push(errorMsg)
      console.error(`✗ ${errorMsg}`)
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
      errors.push(`Error migrating ${instruction.filename}: ${error.message}`)
      failCount++
      console.error(`✗ Failed: ${instruction.filename} - ${error.message}`)
    } else {
      successCount++
      console.log(`✓ Migrated: ${instruction.filename}`)
    }
  }

  // Generate migration mapping document
  if (migrationMapping.length > 0) {
    const mappingDoc = generateMigrationMappingDoc(migrationMapping)
    const mappingPath = path.join(process.cwd(), 'docs', 'process-migration-mapping.md')
    fs.writeFileSync(mappingPath, mappingDoc, 'utf-8')
    console.log(`\n📄 Migration mapping document created: ${mappingPath}`)
  }

  console.log(`\n✅ Migration complete!`)
  console.log(`   Migrated: ${successCount}/${instructions.length}`)
  if (failCount > 0) {
    console.log(`   Failed: ${failCount}`)
  }
  if (errors.length > 0) {
    console.log(`\nErrors:`)
    errors.forEach((err: string) => console.log(`   - ${err}`))
  }

  return {
    success: errors.length === 0,
    migrated: successCount,
    failed: failCount,
    total: instructions.length,
    errors: errors.length > 0 ? errors : undefined,
    migrationMapping,
  }
}

function generateMigrationMappingDoc(mapping: Array<{ sourceFile: string; topicId: string; title: string; agentTypes: string[] }>): string {
  const lines = [
    '# Process Docs Migration Mapping',
    '',
    'This document maps each process documentation file from `docs/process/**` to its corresponding instruction topic in Supabase.',
    '',
    '**Migration Date:** ' + new Date().toISOString(),
    '**Total Files Migrated:** ' + mapping.length,
    '',
    '## Migration Mapping',
    '',
    '| Source File | Topic ID | Title | Agent Types |',
    '|------------|----------|-------|-------------|',
  ]

  for (const item of mapping.sort((a, b) => a.sourceFile.localeCompare(b.sourceFile))) {
    const agentTypesStr = item.agentTypes.length > 0 
      ? item.agentTypes.join(', ')
      : 'all (shared/global)'
    lines.push(`| \`${item.sourceFile}\` | \`${item.topicId}\` | ${item.title} | ${agentTypesStr} |`)
  }

  lines.push('')
  lines.push('## Agent Type Scoping')
  lines.push('')
  lines.push('- **Shared/Global** (`all`): Instructions that apply to all agent types')
  lines.push('- **PM** (`project-manager`): Instructions specific to Project Manager agents')
  lines.push('- **Implementation** (`implementation-agent`): Instructions specific to Implementation agents')
  lines.push('- **QA** (`qa-agent`): Instructions specific to QA agents')
  lines.push('- **Process Review** (`process-review-agent`): Instructions specific to Process Review agents')
  lines.push('')
  lines.push('## Usage')
  lines.push('')
  lines.push('Agents can retrieve instructions via HAL API endpoints:')
  lines.push('')
  lines.push('- `POST /api/instructions/get` - Get all instructions for an agent type (scoped)')
  lines.push('- `POST /api/instructions/get-topic` - Get a specific topic by ID (can access out-of-scope topics)')
  lines.push('- `POST /api/instructions/get-index` - Get instruction index metadata')
  lines.push('')
  lines.push('## Verification')
  lines.push('')
  lines.push('To verify the migration:')
  lines.push('')
  lines.push('1. Open the HAL app and click "Agent Instructions"')
  lines.push('2. Select different agent types (PM, Implementation, QA, Process Review)')
  lines.push('3. Verify that each agent type shows different instruction topics')
  lines.push('4. Verify that shared/global instructions (marked with `all`) appear for all agent types')

  return lines.join('\n')
}

migrateProcessDocs()
  .then(() => {
    console.log('\n✅ Script completed successfully')
    process.exit(0)
  })
  .catch((err) => {
    console.error('Script failed:', err)
    process.exit(1)
  })
