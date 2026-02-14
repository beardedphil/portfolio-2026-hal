/**
 * API endpoint to migrate instruction content from docs/process and docs/templates to Supabase.
 * POST /api/instructions/migrate-docs
 * Body: { repoFullName?: string, supabaseUrl?: string, supabaseAnonKey?: string }
 *
 * Reads docs/process/*.md, docs/process/*.mdc, docs/templates/*.md from the repo,
 * upserts them into agent_instructions. Uses server env for Supabase if not provided in body.
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

function parseMdc(content: string, filename: string): { title: string; description: string; body: string } {
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
  const topicId = filename.replace(/\.mdc$/i, '').replace(/-/g, ' ')
  return {
    title: frontmatter.title || topicId,
    description: frontmatter.description || 'No description',
    body,
  }
}

function parseMd(content: string, filename: string): { title: string; description: string; body: string } {
  const firstLineMatch = content.match(/^#\s+(.+)$/m)
  const title = firstLineMatch ? firstLineMatch[1].trim() : filename.replace(/\.md$/i, '').replace(/-/g, ' ')
  const descMatch = content.match(/\n\n([^\n#].{0,200})/s)
  const description = descMatch ? descMatch[1].trim().slice(0, 200) : 'No description'
  return { title, description, body: content }
}

/** topic_id from filename: ticket.template.md -> ticket-template */
function filenameToTopicId(filename: string): string {
  const base = filename.replace(/\.(md|mdc)$/i, '')
  return base.replace(/\./g, '-').toLowerCase()
}

/** Agent types heuristic from content */
function agentTypesFromContent(content: string, filename: string): string[] {
  const lower = content.toLowerCase()
  const out: string[] = []
  if (lower.includes('qa agent') || lower.includes('qa-agent') || filename.includes('qa')) out.push('qa-agent')
  if (lower.includes('implementation agent') || lower.includes('implementation-agent')) out.push('implementation-agent')
  if (lower.includes('project manager') || lower.includes('project-manager') || lower.includes('pm agent') || filename.includes('pm-')) out.push('project-manager')
  if (lower.includes('process review') || lower.includes('process-review')) out.push('process-review-agent')
  if (out.length === 0) out.push('all')
  return out
}

const DOCS_INSTRUCTIONS: Array<{
  relPath: string
  topicId: string
  isBasic: boolean
  agentTypes: string[]
}> = [
  { relPath: 'docs/process/ready-to-start-checklist.md', topicId: 'ready-to-start-checklist', isBasic: true, agentTypes: ['project-manager', 'all'] },
  { relPath: 'docs/templates/ticket.template.md', topicId: 'ticket-template', isBasic: true, agentTypes: ['project-manager', 'implementation-agent', 'all'] },
  { relPath: 'docs/process/agent-supabase-api-paradigm.mdc', topicId: 'agent-supabase-api-paradigm', isBasic: false, agentTypes: ['all'] },
  { relPath: 'docs/process/hal-tool-call-contract.mdc', topicId: 'hal-tool-call-contract', isBasic: false, agentTypes: ['all'] },
  { relPath: 'docs/process/qa-agent-supabase-tools.md', topicId: 'qa-agent-supabase-tools', isBasic: false, agentTypes: ['qa-agent', 'implementation-agent'] },
  { relPath: 'docs/process/ticket-verification-rules.md', topicId: 'ticket-verification-rules', isBasic: false, agentTypes: ['project-manager', 'qa-agent', 'implementation-agent'] },
  { relPath: 'docs/process/pm-handoff.md', topicId: 'pm-handoff', isBasic: false, agentTypes: ['project-manager', 'process-review-agent'] },
  { relPath: 'docs/templates/agent-task-prompt.template.md', topicId: 'agent-task-prompt-template', isBasic: false, agentTypes: ['implementation-agent'] },
  { relPath: 'docs/templates/instructions-used.template.md', topicId: 'instructions-used-template', isBasic: false, agentTypes: ['implementation-agent'] },
  { relPath: 'docs/templates/pm-review.template.md', topicId: 'pm-review-template', isBasic: false, agentTypes: ['implementation-agent'] },
]

export default async function handler(req: IncomingMessage, res: ServerResponse) {
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
        error:
          'Supabase credentials required. Provide supabaseUrl and supabaseAnonKey in the request body, or set SUPABASE_URL and SUPABASE_ANON_KEY (or VITE_*) in the server environment.',
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)
    const repoRoot = process.cwd()

    const instructions: Array<{
      repo_full_name: string
      topic_id: string
      filename: string
      title: string
      description: string
      content_md: string
      content_body: string
      always_apply: boolean
      agent_types: string[]
      is_basic: boolean
      is_situational: boolean
      topic_metadata: Record<string, unknown> | null
    }> = []
    const errors: string[] = []

    for (const { relPath, topicId, isBasic, agentTypes } of DOCS_INSTRUCTIONS) {
      const filePath = path.join(repoRoot, relPath)
      try {
        if (!fs.existsSync(filePath)) {
          errors.push(`File not found: ${relPath}`)
          continue
        }
        const content = fs.readFileSync(filePath, 'utf8')
        const filename = path.basename(relPath)
        const isMdc = filename.endsWith('.mdc')
        const { title, description, body } = isMdc ? parseMdc(content, filename) : parseMd(content, filename)
        const inferredAgents = agentTypesFromContent(content, filename)
        const combinedAgents = [...new Set([...agentTypes, ...inferredAgents])]

        instructions.push({
          repo_full_name: repoFullName,
          topic_id: topicId,
          filename,
          title,
          description,
          content_md: content,
          content_body: body,
          always_apply: false,
          agent_types: combinedAgents,
          is_basic: isBasic,
          is_situational: !isBasic,
          topic_metadata: { title, description },
        })
      } catch (err) {
        errors.push(`${relPath}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    let successCount = 0
    for (const row of instructions) {
      const { error } = await supabase.from('agent_instructions').upsert(row, {
        onConflict: 'repo_full_name,topic_id',
      })
      if (error) {
        errors.push(`${row.topic_id}: ${error.message}`)
      } else {
        successCount++
      }
    }

    json(res, 200, {
      success: errors.length === 0,
      migrated: successCount,
      total: instructions.length,
      errors: errors.length > 0 ? errors : undefined,
      message: `Migrated ${successCount} of ${instructions.length} docs instructions to Supabase${errors.length > 0 ? ` (${errors.length} errors)` : ''}.`,
    })
  } catch (err) {
    json(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
