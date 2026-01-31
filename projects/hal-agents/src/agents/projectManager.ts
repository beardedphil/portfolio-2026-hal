/**
 * Project Manager agent — context pack, read-only tools, OpenAI Responses API.
 * Module: portfolio-2026-hal-agents (no server required).
 */

import { createOpenAI } from '@ai-sdk/openai'
import { generateText, tool } from 'ai'
import { z } from 'zod'
import fs from 'fs/promises'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import { redact } from '../utils/redact.js'
import {
  listDirectory,
  readFile,
  searchFiles,
  type ToolContext,
} from './tools.js'

const execAsync = promisify(exec)

const SIGNATURE = '[PM@hal-agents]'

// --- Legacy respond (kept for backward compatibility) ---

export type RespondContext = {
  [key: string]: unknown
}

export type RespondInput = {
  message: string
  context?: RespondContext
}

export type RespondMeta = {
  source: 'hal-agents'
  case: 'standup' | 'default'
}

export type RespondOutput = {
  replyText: string
  meta: RespondMeta
}

const STANDUP_TRIGGERS = ['standup', 'status']

function isStandupOrStatus(message: string): boolean {
  const normalized = message.trim().toLowerCase()
  return STANDUP_TRIGGERS.some((t) => normalized.includes(t))
}

export function respond(input: RespondInput): RespondOutput {
  const { message } = input
  if (isStandupOrStatus(message)) {
    return {
      replyText: `${SIGNATURE} Standup summary:
• Reviewed ticket backlog
• No blockers identified
• Ready to assist with prioritization`,
      meta: { source: 'hal-agents', case: 'standup' },
    }
  }
  return {
    replyText: `${SIGNATURE} Message received. Here's a quick checklist to move forward:
• [ ] Clarify scope if needed
• [ ] Confirm priority with stakeholder
• [ ] Break down into tasks when ready`,
    meta: { source: 'hal-agents', case: 'default' },
  }
}

// --- runPmAgent (0003) ---

export type ConversationTurn = { role: 'user' | 'assistant'; content: string }

export interface PmAgentConfig {
  repoRoot: string
  openaiApiKey: string
  openaiModel: string
  rulesDir?: string
  /** Prior turns for multi-turn context (last N messages). */
  conversationHistory?: ConversationTurn[]
  /** Pre-built "Conversation so far" section (e.g. summary + recent from DB). When set, used instead of conversationHistory. */
  conversationContextPack?: string
  /** OpenAI Responses API: continue from this response for continuity. */
  previousResponseId?: string
}

export interface ToolCallRecord {
  name: string
  input: unknown
  output: unknown
}

export interface PmAgentResult {
  reply: string
  toolCalls: ToolCallRecord[]
  outboundRequest: object
  /** OpenAI Responses API response id for continuity (previous_response_id on next turn). */
  responseId?: string
  error?: string
  errorPhase?: 'context-pack' | 'openai' | 'tool'
}

const PM_SYSTEM_INSTRUCTIONS = `You are the Project Manager agent for HAL. Your job is to help users understand the codebase, review tickets, and provide project guidance.

You have access to read-only tools to explore the repository. Use them to answer questions about code, tickets, and project state.

Always cite file paths when referencing specific content.`

const MAX_TOOL_ITERATIONS = 10
/** Cap on character count for "recent conversation" so long technical messages don't dominate. (~3k tokens) */
const CONVERSATION_RECENT_MAX_CHARS = 12_000

function recentTurnsWithinCharBudget(
  turns: ConversationTurn[],
  maxChars: number
): { recent: ConversationTurn[]; omitted: number } {
  if (turns.length === 0) return { recent: [], omitted: 0 }
  let len = 0
  const recent: ConversationTurn[] = []
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i]
    const lineLen = (t.role?.length ?? 0) + (t.content?.length ?? 0) + 12
    if (len + lineLen > maxChars && recent.length > 0) break
    recent.unshift(t)
    len += lineLen
  }
  return { recent, omitted: turns.length - recent.length }
}

async function buildContextPack(config: PmAgentConfig, userMessage: string): Promise<string> {
  const rulesDir = config.rulesDir ?? '.cursor/rules'
  const rulesPath = path.resolve(config.repoRoot, rulesDir)

  const sections: string[] = []

  // Conversation so far: pre-built context pack (e.g. summary + recent from DB) or bounded history
  if (config.conversationContextPack && config.conversationContextPack.trim() !== '') {
    sections.push('## Conversation so far\n\n' + config.conversationContextPack.trim())
  } else {
    const history = config.conversationHistory
    if (history && history.length > 0) {
      const { recent, omitted } = recentTurnsWithinCharBudget(history, CONVERSATION_RECENT_MAX_CHARS)
      const truncNote =
        omitted > 0
          ? `\n(older messages omitted; showing recent conversation within ${CONVERSATION_RECENT_MAX_CHARS.toLocaleString()} characters)\n\n`
          : '\n\n'
      const lines = recent.map((t) => `**${t.role}**: ${t.content}`)
      sections.push('## Conversation so far' + truncNote + lines.join('\n\n'))
    }
  }

  sections.push('## User message\n\n' + userMessage)

  sections.push('## Repo rules (from .cursor/rules/)')
  try {
    const entries = await fs.readdir(rulesPath)
    const mdcFiles = entries.filter((e: string) => e.endsWith('.mdc'))
    for (const f of mdcFiles) {
      const content = await fs.readFile(path.join(rulesPath, f), 'utf8')
      sections.push(`### ${f}\n\n${content}`)
    }
    if (mdcFiles.length === 0) sections.push('(no .mdc files found)')
  } catch {
    sections.push('(rules directory not found or not readable)')
  }

  sections.push('## Git status (git status -sb)')
  try {
    const { stdout } = await execAsync('git status -sb', {
      cwd: config.repoRoot,
      encoding: 'utf8',
    })
    sections.push('```\n' + stdout.trim() + '\n```')
  } catch {
    sections.push('(git status failed)')
  }

  return sections.join('\n\n')
}

export async function runPmAgent(
  message: string,
  config: PmAgentConfig
): Promise<PmAgentResult> {
  const toolCalls: ToolCallRecord[] = []
  let capturedRequest: object | null = null

  const ctx: ToolContext = { repoRoot: config.repoRoot }

  let contextPack: string
  try {
    contextPack = await buildContextPack(config, message)
  } catch (err) {
    return {
      reply: '',
      toolCalls: [],
      outboundRequest: {},
      error: err instanceof Error ? err.message : String(err),
      errorPhase: 'context-pack',
    }
  }

  const openai = createOpenAI({
    apiKey: config.openaiApiKey,
    fetch: async (url, init) => {
      if (init?.body && !capturedRequest) {
        try {
          capturedRequest = JSON.parse(init.body as string) as object
        } catch {
          capturedRequest = { _parseError: true }
        }
      }
      return fetch(url, init)
    },
  })

  const model = openai.responses(config.openaiModel)

  const tools = {
    list_directory: tool({
      description: 'List files in a directory. Path is relative to repo root.',
      parameters: z.object({
        path: z.string().describe('Directory path (relative to repo root)'),
      }),
      execute: async (input) => {
        const out = await listDirectory(ctx, input)
        toolCalls.push({ name: 'list_directory', input, output: out })
        return typeof (out as { error?: string }).error === 'string'
          ? JSON.stringify(out)
          : out
      },
    }),
    read_file: tool({
      description: 'Read file contents. Path is relative to repo root. Max 500 lines.',
      parameters: z.object({
        path: z.string().describe('File path (relative to repo root)'),
      }),
      execute: async (input) => {
        const out = await readFile(ctx, input)
        toolCalls.push({ name: 'read_file', input, output: out })
        return typeof (out as { error?: string }).error === 'string'
          ? JSON.stringify(out)
          : out
      },
    }),
    search_files: tool({
      description: 'Regex search across files. Pattern is JavaScript regex.',
      parameters: z.object({
        pattern: z.string().describe('Regex pattern to search for'),
      }),
      execute: async (input) => {
        const out = await searchFiles(ctx, input)
        toolCalls.push({ name: 'search_files', input, output: out })
        return typeof (out as { error?: string }).error === 'string'
          ? JSON.stringify(out)
          : out
      },
    }),
  }

  const prompt = `${contextPack}\n\n---\n\nRespond to the user message above using the tools as needed.`

  const providerOptions =
    config.previousResponseId != null && config.previousResponseId !== ''
      ? { openai: { previousResponseId: config.previousResponseId } }
      : undefined

  try {
    const result = await generateText({
      model,
      system: PM_SYSTEM_INSTRUCTIONS,
      prompt,
      tools,
      maxSteps: MAX_TOOL_ITERATIONS,
      ...(providerOptions && { providerOptions }),
    })

    const reply = result.text ?? ''
    const outboundRequest = capturedRequest
      ? (redact(capturedRequest) as object)
      : {}
    const responseId =
      result.providerMetadata && typeof result.providerMetadata === 'object' && result.providerMetadata !== null
        ? (result.providerMetadata as { openai?: { responseId?: string } }).openai?.responseId
        : undefined

    return {
      reply,
      toolCalls,
      outboundRequest,
      ...(responseId != null && { responseId }),
    }
  } catch (err) {
    return {
      reply: '',
      toolCalls,
      outboundRequest: capturedRequest ? (redact(capturedRequest) as object) : {},
      error: err instanceof Error ? err.message : String(err),
      errorPhase: 'openai',
    }
  }
}

/**
 * Summarize older conversation turns using the external LLM (OpenAI).
 * HAL is encouraged to use this whenever building a bounded context pack from long
 * history: the LLM produces a short summary so the main PM turn receives summary + recent
 * messages instead of unbounded transcript.
 * Used when full history is in DB and we send summary + last N to the PM model.
 */
export async function summarizeForContext(
  messages: ConversationTurn[],
  openaiApiKey: string,
  openaiModel: string
): Promise<string> {
  if (messages.length === 0) return ''
  const openai = createOpenAI({ apiKey: openaiApiKey })
  const model = openai.responses(openaiModel)
  const transcript = messages.map((t) => `${t.role}: ${t.content}`).join('\n\n')
  const prompt = `Summarize this conversation in 2-4 sentences. Preserve key decisions, topics, and context so the next turn can continue naturally.\n\nConversation:\n\n${transcript}`
  const result = await generateText({ model, prompt })
  return (result.text ?? '').trim() || '(No summary generated)'
}
