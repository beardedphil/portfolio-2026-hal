/**
 * API endpoint to migrate process documentation from docs/process/ to Supabase
 * POST /api/instructions/migrate-process-docs
 * Body: { repoFullName?: string, supabaseUrl?: string, supabaseAnonKey?: string }
 * 
 * This endpoint performs the migration directly (no external script needed)
 */

import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return {}
  return JSON.parse(raw) as unknown
}

function json(res: ServerResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

/**
 * Determine agent types for a process doc based on filename and content
 */
function determineAgentTypes(filename: string, content: string): string[] {
  const contentLower = content.toLowerCase()
  const filenameLower = filename.toLowerCase()
  const agentTypes = new Set<string>()

  // Specific file-based rules (most specific first)
  if (filename === 'ready-to-start-checklist.md') {
    // Applies to all agents (PM checks before moving, agents check before starting)
    agentTypes.add('all')
  } else if (filename === 'pm-handoff.md') {
    agentTypes.add('project-manager')
  } else if (filename === 'ticket-verification-rules.md') {
    // Applies to QA and PM (verification rules)
    agentTypes.add('qa-agent')
    agentTypes.add('project-manager')
  } else if (filename === 'qa-agent-supabase-tools.md') {
    agentTypes.add('qa-agent')
    agentTypes.add('implementation-agent') // Implementation agents also use these tools
  } else if (filename === 'agent-supabase-api-paradigm.mdc') {
    // Applies to all agents (all use HAL API)
    agentTypes.add('all')
  } else if (filename === 'hal-tool-call-contract.mdc') {
    // Applies to all agents (all use tool calls)
    agentTypes.add('all')
  } else if (filename === 'chat-ui-staging-test-procedure.mdc') {
    // Applies to Implementation and QA (they run staging tests)
    agentTypes.add('implementation-agent')
    agentTypes.add('qa-agent')
  } else if (filename === 'status-message-template.mdc') {
    // Applies to all agents (template for all agent types)
    agentTypes.add('all')
  } else if (filename === 'cloud-artifacts-without-merge-brainstorm.md') {
    // Applies to all agents (process discussion)
    agentTypes.add('all')
  } else if (filename === 'single-source-agents.md') {
    // Applies to all agents (process guidance)
    agentTypes.add('all')
  } else if (filename === 'split-repos-and-deployment.md') {
    // Applies to all agents (deployment guidance)
    agentTypes.add('all')
  } else if (filename === 'vercel-preview-smoke-test.md') {
    // Applies to all agents (testing guidance)
    agentTypes.add('all')
  } else if (filename === 'MIGRATION_SUMMARY.md') {
    // Migration summary - applies to all agents for reference
    agentTypes.add('all')
  } else {
    // Content-based detection
    const hasAllAgents = 
      contentLower.includes('all agent') || 
      contentLower.includes('all agents') ||
      contentLower.includes('every agent') ||
      contentLower.includes('any agent')
    
    if (hasAllAgents) {
      agentTypes.add('all')
    } else {
      // Check for specific agent mentions
      const hasQA = contentLower.includes('qa agent') || contentLower.includes('qa-agent') || 
                    filenameLower.includes('qa') || contentLower.includes('qa report')
      const hasImplementation = contentLower.includes('implementation agent') || 
                               contentLower.includes('implementation-agent') ||
                               contentLower.includes('implementation:')
      const hasPM = contentLower.includes('project manager') || 
                   contentLower.includes('project-manager') || 
                   contentLower.includes('pm agent') ||
                   filenameLower.includes('pm-')
      const hasProcessReview = contentLower.includes('process review') || 
                              contentLower.includes('process-review') ||
                              filenameLower.includes('process-review')
      
      if (hasQA) agentTypes.add('qa-agent')
      if (hasImplementation) agentTypes.add('implementation-agent')
      if (hasPM) agentTypes.add('project-manager')
      if (hasProcessReview) agentTypes.add('process-review-agent')
    }
  }

  // If no agent types found, default to 'all' (shared/global)
  if (agentTypes.size === 0) {
    agentTypes.add('all')
  }

  return Array.from(agentTypes)
}

/**
 * Determine if instruction is basic (always loaded) or situational (on-demand)
 */
function determineInstructionType(filename: string, content: string): { isBasic: boolean; isSituational: boolean } {
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
function parseProcessDoc(filePath: string, content: string, processDocsDir: string) {
  const filename = path.basename(filePath)
  const relativePath = path.relative(processDocsDir, filePath)
  
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
function findProcessDocs(dir: string, fileList: string[] = []): string[] {
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

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // CORS: Allow cross-origin requests
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  if (req.method !== 'POST') {
    res.statusCode = 405
    res.end('Method Not Allowed')
    return
  }

  try {
    const body = (await readJsonBody(req)) as {
      repoFullName?: string
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const repoFullName = typeof body.repoFullName === 'string' ? body.repoFullName.trim() : 'beardedphil/portfolio-2026-hal'

    // Use credentials from request body if provided, otherwise fall back to server environment variables
    const supabaseUrl =
      (typeof body.supabaseUrl === 'string' ? body.supabaseUrl.trim() : undefined) ||
      process.env.SUPABASE_URL?.trim() ||
      process.env.VITE_SUPABASE_URL?.trim() ||
      undefined
    const supabaseAnonKey =
      (typeof body.supabaseAnonKey === 'string' ? body.supabaseAnonKey.trim() : undefined) ||
      process.env.SUPABASE_ANON_KEY?.trim() ||
      process.env.VITE_SUPABASE_ANON_KEY?.trim() ||
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
      undefined

    if (!supabaseUrl || !supabaseAnonKey) {
      json(res, 400, {
        success: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Find docs/process directory
    const processDocsDir = path.join(process.cwd(), 'docs', 'process')

    if (!fs.existsSync(processDocsDir)) {
      json(res, 200, {
        success: false,
        error: `Process docs directory not found: ${processDocsDir}. Current directory: ${process.cwd()}`,
      })
      return
    }

    // Find all process doc files
    const files = findProcessDocs(processDocsDir)
    console.log(`[API] Found ${files.length} process doc files`)

    const instructions = []
    const migrationMapping: Array<{
      originalPath: string
      topicId: string
      title: string
      agentTypes: string[]
      isBasic: boolean
      isSituational: boolean
    }> = []

    for (const filePath of files) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8')
        const parsed = parseProcessDoc(filePath, content, processDocsDir)
        
        instructions.push({
          repo_full_name: repoFullName,
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
      } catch (err) {
        console.error(`Error processing ${filePath}:`, err)
      }
    }

    console.log(`[API] Migrating ${instructions.length} instructions...`)

    // Upsert instructions
    let successCount = 0
    let failCount = 0
    const errors: string[] = []
    
    for (const instruction of instructions) {
      const { error } = await supabase
        .from('agent_instructions')
        .upsert(instruction, {
          onConflict: 'repo_full_name,topic_id',
        })

      if (error) {
        errors.push(`Error migrating ${instruction.filename}: ${error.message}`)
        failCount++
      } else {
        successCount++
      }
    }

    // Create migration mapping document as an instruction topic
    const mappingContent = `# Process Docs Migration Mapping

This document maps all process documentation files from \`docs/process/\` to their corresponding instruction topics in Supabase.

**Migration Date:** ${new Date().toISOString()}
**Repo:** ${repoFullName}

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
      repo_full_name: repoFullName,
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
      errors.push(`Error storing migration mapping: ${mappingError.message}`)
    }

    json(res, 200, {
      success: errors.length === 0,
      migrated: successCount,
      failed: failCount,
      total: instructions.length,
      errors: errors.length > 0 ? errors : undefined,
      message: `Migrated ${successCount} of ${instructions.length} process docs${errors.length > 0 ? ` (${errors.length} errors)` : ''}`,
      migrationMapping: {
        topicId: 'process-docs-migration-mapping',
        stored: !mappingError,
      },
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
