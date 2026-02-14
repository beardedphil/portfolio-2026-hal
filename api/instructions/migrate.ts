/**
 * API endpoint to migrate instructions from filesystem to Supabase
 * POST /api/instructions/migrate
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

function parseInstructionFile(filePath: string, content: string) {
  const filename = path.basename(filePath)
  const topicId = filename.replace('.mdc', '')
  
  // Parse frontmatter
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

  // Determine agent types from content
  const agentTypes: string[] = []
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

    // Find .cursor/rules directory
    const rulesDir = path.join(process.cwd(), '.cursor', 'rules')
    const indexPath = path.join(rulesDir, '.instructions-index.json')

    if (!fs.existsSync(rulesDir)) {
      json(res, 200, {
        success: false,
        error: `Rules directory not found: ${rulesDir}. Current directory: ${process.cwd()}`,
      })
      return
    }

    // Load instruction index
    let instructionIndex: {
      basic?: string[]
      situational?: Record<string, string[]>
      topics?: Record<string, { title: string; description: string; agentTypes: string[]; keywords?: string[] }>
    } = { basic: [], situational: {}, topics: {} }

    if (fs.existsSync(indexPath)) {
      try {
        const indexContent = fs.readFileSync(indexPath, 'utf-8')
        instructionIndex = JSON.parse(indexContent)
      } catch (err) {
        console.warn('Could not load instruction index:', err)
      }
    }

    // Read all .mdc files
    const files = fs.readdirSync(rulesDir).filter(f => f.endsWith('.mdc') && !f.startsWith('.'))
    console.log(`[API] Found ${files.length} instruction files`)

    const instructions = []
    const errors: string[] = []
    
    for (const file of files) {
      const filePath = path.join(rulesDir, file)
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
          repo_full_name: repoFullName,
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
        errors.push(`Error processing ${file}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    console.log(`[API] Migrating ${instructions.length} instructions...`)

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

    // Upsert instruction index
    if (Object.keys(instructionIndex).length > 0) {
      const { error: indexError } = await supabase
        .from('agent_instruction_index')
        .upsert({
          repo_full_name: repoFullName,
          index_data: instructionIndex,
        }, {
          onConflict: 'repo_full_name',
        })

      if (indexError) {
        errors.push(`Error migrating instruction index: ${indexError.message}`)
      }
    }

    json(res, 200, {
      success: errors.length === 0,
      migrated: successCount,
      failed: failCount,
      total: instructions.length,
      errors: errors.length > 0 ? errors : undefined,
      message: `Migrated ${successCount} of ${instructions.length} instructions${errors.length > 0 ? ` (${errors.length} errors)` : ''}`,
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
