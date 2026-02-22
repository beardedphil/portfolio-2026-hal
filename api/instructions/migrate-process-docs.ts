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
 * Extract Supabase URL from request body or environment
 */
function getSupabaseUrl(body: { supabaseUrl?: string }): string | undefined {
  if (typeof body.supabaseUrl === 'string') {
    return body.supabaseUrl.trim() || undefined
  }
  return process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim() || undefined
}

/**
 * Extract Supabase anon key from request body or environment
 */
function getSupabaseAnonKey(body: { supabaseAnonKey?: string }): string | undefined {
  if (typeof body.supabaseAnonKey === 'string') {
    return body.supabaseAnonKey.trim() || undefined
  }
  return (
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.VITE_SUPABASE_ANON_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    undefined
  )
}

/**
 * Agent type detection patterns
 */
const AGENT_TYPE_PATTERNS = {
  all: {
    content: ['all agent', 'all agents'],
    filename: ['hal-tool-call-contract', 'agent-supabase-api-paradigm', 'single-source-agents'],
  },
  'project-manager': {
    content: ['pm agent', 'project manager', 'project-manager'],
    filename: ['pm-handoff', 'ready-to-start-checklist'],
  },
  'qa-agent': {
    content: ['qa agent', 'qa-agent'],
    filename: ['qa-agent', 'ticket-verification-rules'],
  },
  'implementation-agent': {
    content: ['implementation agent', 'implementation-agent'],
    filename: ['implementation'],
  },
  'process-review-agent': {
    content: ['process review', 'process-review'],
    filename: ['process-review'],
  },
} as const

/**
 * Check if text contains any of the given patterns
 */
function matchesPatterns(text: string, patterns: readonly string[]): boolean {
  return patterns.some(pattern => text.includes(pattern))
}

/**
 * Determine agent types for a process doc based on filename and content
 */
export function determineAgentTypes(filename: string, content: string): string[] {
  const contentLower = content.toLowerCase()
  const filenameLower = filename.toLowerCase()
  const agentTypes = new Set<string>()

  // Check each agent type pattern
  for (const [agentType, patterns] of Object.entries(AGENT_TYPE_PATTERNS)) {
    if (
      matchesPatterns(contentLower, patterns.content) ||
      matchesPatterns(filenameLower, patterns.filename)
    ) {
      agentTypes.add(agentType)
    }
  }

  // If no specific agent types found, default to 'all' (shared/global)
  if (agentTypes.size === 0) {
    agentTypes.add('all')
  }

  return Array.from(agentTypes)
}

/**
 * Instruction type detection patterns
 */
const BASIC_INDICATORS = [
  'hal-tool-call-contract',
  'agent-supabase-api-paradigm',
  'ready-to-start-checklist',
  'ticket-verification-rules',
  'single-source-agents',
] as const

const SITUATIONAL_INDICATORS = [
  'staging-test',
  'smoke-test',
  'migration',
  'procedure',
] as const

/**
 * Determine if instruction is basic (always loaded) or situational (on-demand)
 */
export function determineInstructionType(
  filename: string,
  _content: string
): { isBasic: boolean; isSituational: boolean } {
  const filenameLower = filename.toLowerCase()

  if (matchesPatterns(filenameLower, BASIC_INDICATORS)) {
    return { isBasic: true, isSituational: false }
  }

  if (matchesPatterns(filenameLower, SITUATIONAL_INDICATORS)) {
    return { isBasic: false, isSituational: true }
  }

  // Default: basic for core process docs
  return { isBasic: true, isSituational: false }
}

/**
 * Generate topic ID from file path
 */
function generateTopicId(filePath: string, filename: string, processDocsDir: string): string {
  const relativePath = path.relative(processDocsDir, filePath)
  let topicId = filename.replace(/\.(md|mdc)$/, '')
  
  if (relativePath !== filename) {
    const dir = path.dirname(relativePath)
    if (dir !== '.') {
      topicId = `${dir.replace(/\//g, '-')}-${topicId}`
    }
  }
  
  return topicId.replace(/[^a-z0-9-]/gi, '-').toLowerCase()
}

/**
 * Extract title from content or filename
 */
function extractTitle(content: string, filename: string): string {
  const titleMatch = content.match(/^#\s+(.+)$/m)
  if (titleMatch) {
    return titleMatch[1].trim()
  }
  return filename.replace(/\.(md|mdc)$/, '').replace(/-/g, ' ')
}

/**
 * Extract description from content
 */
function extractDescription(content: string): string {
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/)
  if (frontmatterMatch) {
    const frontmatter = frontmatterMatch[1]
    const descMatch = frontmatter.match(/^description:\s*(.+)$/m)
    if (descMatch) {
      return descMatch[1].trim().replace(/^["']|["']$/g, '')
    }
  }
  
  // Try to extract from first paragraph
  const firstParaMatch = content.match(/^#\s+[^\n]+\n\n([^\n]+)/)
  if (firstParaMatch) {
    return firstParaMatch[1].trim()
  }
  
  return 'No description'
}

/**
 * Parse a process doc file and extract metadata
 */
export function parseProcessDoc(filePath: string, content: string, processDocsDir: string) {
  const filename = path.basename(filePath)
  const relativePath = path.relative(processDocsDir, filePath)
  
  const topicId = generateTopicId(filePath, filename, processDocsDir)
  const title = extractTitle(content, filename)
  const description = extractDescription(content)
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

const MARKDOWN_EXTENSIONS = /\.(md|mdc)$/
const EXCLUDED_DIR = 'supabase-migrations'

type MigrationMappingItem = {
  originalPath: string
  topicId: string
  title: string
  agentTypes: string[]
  isBasic: boolean
  isSituational: boolean
}

/**
 * Process files and extract instructions and migration mapping
 */
function processFiles(
  files: string[],
  processDocsDir: string,
  repoFullName: string
): {
  instructions: Array<Record<string, unknown>>
  migrationMapping: MigrationMappingItem[]
} {
  const instructions: Array<Record<string, unknown>> = []
  const migrationMapping: MigrationMappingItem[] = []

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

  return { instructions, migrationMapping }
}

/**
 * Migrate instructions to Supabase
 */
async function migrateInstructions(
  supabase: ReturnType<typeof createClient>,
  instructions: Array<Record<string, unknown>>
): Promise<{ successCount: number; failCount: number; errors: string[] }> {
  let successCount = 0
  let failCount = 0
  const errors: string[] = []

  for (const instruction of instructions) {
    const { error } = await supabase.from('agent_instructions').upsert(instruction, {
      onConflict: 'repo_full_name,topic_id',
    })

    if (error) {
      errors.push(`Error migrating ${instruction.filename as string}: ${error.message}`)
      failCount++
    } else {
      successCount++
    }
  }

  return { successCount, failCount, errors }
}

/**
 * Generate migration mapping content
 */
function generateMappingContent(
  repoFullName: string,
  totalFiles: number,
  successCount: number,
  failCount: number,
  migrationMapping: MigrationMappingItem[]
): string {
  const formatType = (m: MigrationMappingItem): string => {
    if (m.isBasic) return 'Basic'
    if (m.isSituational) return 'Situational'
    return 'Basic'
  }

  return `# Process Docs Migration Mapping

This document maps all process documentation files from \`docs/process/\` to their corresponding instruction topics in Supabase.

**Migration Date:** ${new Date().toISOString()}
**Repo:** ${repoFullName}

## Migration Summary

- **Total files migrated:** ${totalFiles}
- **Successfully migrated:** ${successCount}
- **Failed:** ${failCount}

## File Mapping

| Original Path | Topic ID | Title | Agent Types | Type |
|--------------|----------|-------|-------------|------|
${migrationMapping.map(m => `| \`${m.originalPath}\` | \`${m.topicId}\` | ${m.title} | ${m.agentTypes.join(', ')} | ${formatType(m)}`).join('\n')}

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
}

/**
 * Store migration mapping as an instruction topic
 */
async function storeMigrationMapping(
  supabase: ReturnType<typeof createClient>,
  repoFullName: string,
  totalFiles: number,
  successCount: number,
  failCount: number,
  migrationMapping: MigrationMappingItem[]
): Promise<{ message: string } | null> {
  const mappingContent = generateMappingContent(repoFullName, totalFiles, successCount, failCount, migrationMapping)

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

  const { error } = await supabase.from('agent_instructions').upsert(mappingInstruction, {
    onConflict: 'repo_full_name,topic_id',
  })

  return error
}

/**
 * Recursively find all markdown files in docs/process
 */
export function findProcessDocs(dir: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dir)

  for (const file of files) {
    const filePath = path.join(dir, file)
    const stat = fs.statSync(filePath)

    if (stat.isDirectory()) {
      // Skip supabase-migrations subdirectory (those are SQL migrations, not process docs)
      if (file !== EXCLUDED_DIR) {
        findProcessDocs(filePath, fileList)
      }
    } else if (MARKDOWN_EXTENSIONS.test(file)) {
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
    const supabaseUrl = getSupabaseUrl(body)
    const supabaseAnonKey = getSupabaseAnonKey(body)

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

    const { instructions, migrationMapping } = processFiles(files, processDocsDir, repoFullName)

    console.log(`[API] Migrating ${instructions.length} instructions...`)

    const { successCount, failCount, errors } = await migrateInstructions(supabase, instructions)

    const mappingError = await storeMigrationMapping(
      supabase,
      repoFullName,
      instructions.length,
      successCount,
      failCount,
      migrationMapping
    )

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
