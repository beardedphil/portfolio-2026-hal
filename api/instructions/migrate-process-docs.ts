/**
 * API endpoint to migrate process docs from docs/process/** to Supabase
 * POST /api/instructions/migrate-process-docs
 * 
 * This endpoint migrates all process documentation files to Supabase as instruction topics
 * with proper agent type scoping.
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
  if (contentLower.includes('project manager') || contentLower.includes('project-manager') || contentLower.includes('pm agent') || filenameLower.includes('pm-')) {
    agentTypes.push('project-manager')
  }
  if (contentLower.includes('process review') || contentLower.includes('process-review')) {
    agentTypes.push('process-review-agent')
  }

  // Specific file-based rules
  if (filenameLower.includes('ready-to-start') || filenameLower.includes('ticket-verification')) {
    // These apply to all agents
    agentTypes.push('all')
  } else if (filenameLower.includes('agent-supabase-api') || filenameLower.includes('hal-tool-call')) {
    // These apply to all agents
    agentTypes.push('all')
  } else if (filenameLower.includes('chat-ui-staging') || filenameLower.includes('vercel-preview')) {
    // These apply to Implementation and QA
    if (!agentTypes.includes('implementation-agent')) agentTypes.push('implementation-agent')
    if (!agentTypes.includes('qa-agent')) agentTypes.push('qa-agent')
  } else if (filenameLower.includes('pm-handoff')) {
    // PM only
    if (!agentTypes.includes('project-manager')) agentTypes.push('project-manager')
  } else if (filenameLower.includes('single-source') || filenameLower.includes('split-repos') || filenameLower.includes('cloud-artifacts')) {
    // PM and Process Review
    if (!agentTypes.includes('project-manager')) agentTypes.push('project-manager')
    if (!agentTypes.includes('process-review-agent')) agentTypes.push('process-review-agent')
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
  
  // Generate topic ID from filename (remove extension, convert to kebab-case)
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
  
  // Determine if this is always applied (shared/global)
  const alwaysApply = agentTypes.includes('all') || frontmatter.alwaysApply === 'true'
  
  // Extract title from first heading or filename
  const titleMatch = body.match(/^#+\s+(.+)$/m)
  const title = titleMatch 
    ? titleMatch[1].trim()
    : filename.replace(/\.(md|mdc)$/, '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  
  // Extract description from first paragraph or frontmatter
  const description = frontmatter.description || 
    body.split('\n\n').find(p => p.trim().length > 20 && !p.trim().startsWith('#'))?.slice(0, 200) ||
    'Process documentation'

  return {
    topicId,
    filename,
    title,
    description,
    contentMd: content,
    contentBody: body,
    alwaysApply,
    agentTypes: alwaysApply ? ['all'] : agentTypes.filter(t => t !== 'all'), // If alwaysApply, use 'all', otherwise use specific types
    relativePath,
  }
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
    const processDir = path.join(process.cwd(), 'docs', 'process')
    
    if (!fs.existsSync(processDir)) {
      json(res, 200, {
        success: false,
        error: `Process docs directory not found: ${processDir}. Current directory: ${process.cwd()}`,
      })
      return
    }

    // Recursively find all .md and .mdc files in docs/process
    const files: string[] = []
    function findFiles(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          // Skip supabase-migrations subdirectory (those are SQL migrations, not process docs)
          if (entry.name !== 'supabase-migrations') {
            findFiles(fullPath)
          }
        } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.mdc'))) {
          files.push(fullPath)
        }
      }
    }
    
    findFiles(processDir)
    console.log(`[API] Found ${files.length} process doc files`)

    const instructions = []
    const errors: string[] = []
    const migrationMapping: Array<{ sourceFile: string; topicId: string; title: string; agentTypes: string[] }> = []
    
    for (const filePath of files) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8')
        const parsed = parseProcessDoc(filePath, content)
        
        // Determine if basic or situational (process docs are typically situational/on-demand)
        const isBasic = false // Process docs are not basic instructions
        const isSituational = true // Process docs are situational/on-demand
        
        // Build topic metadata
        const topicMetadata = {
          title: parsed.title,
          description: parsed.description,
          agentTypes: parsed.agentTypes,
          sourceFile: parsed.relativePath,
        }

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
      } catch (err) {
        errors.push(`Error processing ${filePath}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    console.log(`[API] Migrating ${instructions.length} process docs...`)

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
      } else {
        successCount++
      }
    }

    json(res, 200, {
      success: errors.length === 0,
      migrated: successCount,
      failed: failCount,
      total: instructions.length,
      errors: errors.length > 0 ? errors : undefined,
      migrationMapping,
      message: `Migrated ${successCount} of ${instructions.length} process docs${errors.length > 0 ? ` (${errors.length} errors)` : ''}`,
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
