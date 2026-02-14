#!/usr/bin/env node

/**
 * Build-time script: read docs/process and docs/templates instruction files,
 * write api/instructions/docs-bundle.json for use by migrate-docs API in deployment.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.join(__dirname, '..')

const DOCS_INSTRUCTIONS = [
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

function parseMdc(content, filename) {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/
  const match = content.match(frontmatterRegex)
  let frontmatter = {}
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

function parseMd(content, filename) {
  const firstLineMatch = content.match(/^#\s+(.+)$/m)
  const title = firstLineMatch ? firstLineMatch[1].trim() : filename.replace(/\.md$/i, '').replace(/-/g, ' ')
  const descMatch = content.match(/\n\n([^\n#].{0,200})/s)
  const description = descMatch ? descMatch[1].trim().slice(0, 200) : 'No description'
  return { title, description, body: content }
}

function agentTypesFromContent(content, filename) {
  const lower = content.toLowerCase()
  const out = []
  if (lower.includes('qa agent') || lower.includes('qa-agent') || filename.includes('qa')) out.push('qa-agent')
  if (lower.includes('implementation agent') || lower.includes('implementation-agent')) out.push('implementation-agent')
  if (lower.includes('project manager') || lower.includes('project-manager') || lower.includes('pm agent') || filename.includes('pm-')) out.push('project-manager')
  if (lower.includes('process review') || lower.includes('process-review')) out.push('process-review-agent')
  if (out.length === 0) out.push('all')
  return out
}

const instructions = []
for (const { relPath, topicId, isBasic, agentTypes } of DOCS_INSTRUCTIONS) {
  const filePath = path.join(REPO_ROOT, relPath)
  try {
    if (!fs.existsSync(filePath)) {
      console.warn(`[bundle-docs-instructions] Skip (not found): ${relPath}`)
      continue
    }
    const content = fs.readFileSync(filePath, 'utf8')
    const filename = path.basename(relPath)
    const isMdc = filename.endsWith('.mdc')
    const { title, description, body } = isMdc ? parseMdc(content, filename) : parseMd(content, filename)
    const inferredAgents = agentTypesFromContent(content, filename)
    const combinedAgents = [...new Set([...agentTypes, ...inferredAgents])]

    instructions.push({
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
    console.warn(`[bundle-docs-instructions] Error ${relPath}:`, err.message)
  }
}

const outDir = path.join(REPO_ROOT, 'api', 'instructions')
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true })
}
const outPath = path.join(outDir, 'docs-bundle.json')
fs.writeFileSync(outPath, JSON.stringify(instructions, null, 0), 'utf8')
console.log(`[bundle-docs-instructions] Wrote ${instructions.length} instructions to ${outPath}`)
