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
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { redact } from '../utils/redact.js'
import {
  listDirectory,
  readFile,
  searchFiles,
  type ToolContext,
} from './tools.js'

const execAsync = promisify(exec)

/** Slug for ticket filename: lowercase, spaces to hyphens, strip non-alphanumeric except hyphen. */
function slugFromTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'ticket'
}

/** Extract section body after a ## Section Title line (first line after blank line or next ##). */
function sectionContent(body: string, sectionTitle: string): string {
  const re = new RegExp(
    `##\\s+${sectionTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`,
    'i'
  )
  const m = body.match(re)
  return (m?.[1] ?? '').trim()
}

/** Placeholder-like pattern: angle brackets with content (e.g. <AC 1>, <task-id>). */
const PLACEHOLDER_RE = /<[A-Za-z0-9\s\-_]+>/g

export interface ReadyCheckResult {
  ready: boolean
  missingItems: string[]
  checklistResults: {
    goal: boolean
    deliverable: boolean
    acceptanceCriteria: boolean
    constraintsNonGoals: boolean
    noPlaceholders: boolean
  }
}

/**
 * Evaluate ticket body against the Ready-to-start checklist (Definition of Ready).
 * See docs/process/ready-to-start-checklist.md.
 *
 * **Formatting/parsing requirements (exact heading text):**
 * The readiness evaluation expects these exact H2 section titles in the body:
 * - "Goal (one sentence)" — non-empty, no placeholders
 * - "Human-verifiable deliverable (UI-only)" — non-empty, no placeholders
 * - "Acceptance criteria (UI-only)" — must contain at least one `- [ ]` checkbox line
 * - "Constraints" — non-empty
 * - "Non-goals" — non-empty
 * No unresolved placeholders like `<AC 1>`, `<task-id>`, `<short-title>`, etc.
 * Future ticket edits must preserve these headings and structure to avoid breaking readiness.
 */
export function evaluateTicketReady(bodyMd: string): ReadyCheckResult {
  const body = bodyMd.trim()
  const goal = sectionContent(body, 'Goal (one sentence)')
  const deliverable = sectionContent(body, 'Human-verifiable deliverable (UI-only)')
  const ac = sectionContent(body, 'Acceptance criteria (UI-only)')
  const constraints = sectionContent(body, 'Constraints')
  const nonGoals = sectionContent(body, 'Non-goals')

  const goalPlaceholders = goal.match(PLACEHOLDER_RE) ?? []
  const deliverablePlaceholders = deliverable.match(PLACEHOLDER_RE) ?? []
  const goalOk = goal.length > 0 && goalPlaceholders.length === 0 && !/^<[^>]*>$/.test(goal.trim())
  const deliverableOk = deliverable.length > 0 && deliverablePlaceholders.length === 0
  const acOk = /-\s*\[\s*\]/.test(ac)
  const constraintsOk = constraints.length > 0
  const nonGoalsOk = nonGoals.length > 0
  const placeholders = body.match(PLACEHOLDER_RE) ?? []
  const noPlaceholdersOk = placeholders.length === 0

  const missingItems: string[] = []
  if (!goalOk) missingItems.push('Goal (one sentence) missing or placeholder')
  if (!deliverableOk) missingItems.push('Human-verifiable deliverable missing or placeholder')
  if (!acOk) missingItems.push('Acceptance criteria checkboxes missing')
  if (!constraintsOk) missingItems.push('Constraints section missing or empty')
  if (!nonGoalsOk) missingItems.push('Non-goals section missing or empty')
  if (!noPlaceholdersOk) missingItems.push(`Unresolved placeholders: ${placeholders.join(', ')}`)

  return {
    ready: goalOk && deliverableOk && acOk && constraintsOk && nonGoalsOk && noPlaceholdersOk,
    missingItems,
    checklistResults: {
      goal: goalOk,
      deliverable: deliverableOk,
      acceptanceCriteria: acOk,
      constraintsNonGoals: constraintsOk && nonGoalsOk,
      noPlaceholders: noPlaceholdersOk,
    },
  }
}

export interface CheckUnassignedResult {
  moved: string[]
  notReady: Array<{ id: string; title?: string; missingItems: string[] }>
  error?: string
}

const COL_UNASSIGNED = 'col-unassigned'
const COL_TODO = 'col-todo'

/**
 * Check all tickets in Unassigned: evaluate readiness, move ready ones to To Do.
 * Returns list of moved ticket ids and list of not-ready tickets with missing items.
 * Used on app load and after sync so the PM can post a summary to chat.
 */
export async function checkUnassignedTickets(
  supabaseUrl: string,
  supabaseAnonKey: string
): Promise<CheckUnassignedResult> {
  const supabase = createClient(supabaseUrl.trim(), supabaseAnonKey.trim())
  const moved: string[] = []
  const notReady: Array<{ id: string; title?: string; missingItems: string[] }> = []

  try {
    const { data: rows, error: fetchError } = await supabase
      .from('tickets')
      .select('id, title, body_md, kanban_column_id')
      .order('id', { ascending: true })

    if (fetchError) {
      return { moved: [], notReady: [], error: `Supabase fetch: ${fetchError.message}` }
    }

    const unassigned = (rows ?? []).filter(
      (r: { kanban_column_id?: string | null }) =>
        r.kanban_column_id === COL_UNASSIGNED ||
        r.kanban_column_id == null ||
        r.kanban_column_id === ''
    )

    let nextTodoPosition = 0
    const { data: todoRows } = await supabase
      .from('tickets')
      .select('kanban_position')
      .eq('kanban_column_id', COL_TODO)
      .order('kanban_position', { ascending: false })
      .limit(1)
    if (todoRows?.length) {
      const max = (todoRows as { kanban_position?: number }[]).reduce(
        (acc, r) => Math.max(acc, r.kanban_position ?? 0),
        0
      )
      nextTodoPosition = max + 1
    }

    const now = new Date().toISOString()
    for (const row of unassigned) {
      const id = (row as { id: string }).id
      const title = (row as { title?: string }).title
      const bodyMd = (row as { body_md?: string }).body_md ?? ''
      const result = evaluateTicketReady(bodyMd)
      if (result.ready) {
        const { error: updateError } = await supabase
          .from('tickets')
          .update({
            kanban_column_id: COL_TODO,
            kanban_position: nextTodoPosition++,
            kanban_moved_at: now,
          })
          .eq('id', id)
        if (!updateError) moved.push(id)
      } else {
        notReady.push({ id, title, missingItems: result.missingItems })
      }
    }

    return { moved, notReady }
  } catch (err) {
    return {
      moved: [],
      notReady: [],
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

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
  /** When set with supabaseAnonKey, enables create_ticket tool (store ticket to Supabase, then sync writes to repo). */
  supabaseUrl?: string
  supabaseAnonKey?: string
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

You have access to read-only tools to explore the repository. Additional tools (e.g. create_ticket, fetch_ticket_content, update_ticket_body, sync_tickets, kanban_move_ticket_to_todo) are added when the project is connected (Supabase credentials provided). **The only source of truth for which tools you have is the line in this turn's prompt that says "You have X, Y, Z for this request"—that list is generated from the actual tools available for this request. Do not rely on any other document, audit, or prior message for the list of tools; if that line lists update_ticket_body, you have it and must use it when the user asks to edit a ticket.**

**Conversation context:** When "Conversation so far" is present, the "User message" is the user's latest reply in that conversation. Short replies (e.g. "Entirely, in all states", "Yes", "The first one", "inside the embedded kanban UI") are almost always answers to the question you (the assistant) just asked—interpret them in that context. Do not treat short user replies as a new top-level request about repo rules, process, or "all states" enforcement unless the conversation clearly indicates otherwise.

**Creating tickets:** When the user **explicitly** asks to create a ticket (e.g. "create a ticket", "create ticket for that", "create a new ticket for X"), you MUST call the create_ticket tool if it is available. Do NOT call create_ticket for short, non-actionable messages such as: "test", "ok", "hi", "hello", "thanks", "cool", "checking", "asdf", or similar—these are usually the user testing the UI, acknowledging, or typing casually. Do not infer a ticket-creation request from context alone (e.g. if the user sends "Test" while testing the chat UI, that does NOT mean create the chat UI ticket). Calling the tool is what actually creates the ticket—do not only write the ticket content in your message. Use create_ticket with a short title and a full markdown body following the repo ticket template. Do not invent an ID—the tool assigns the next ID. Do not write secrets or API keys into the ticket body. If create_ticket is not in your tool list, tell the user: "I don't have the create-ticket tool for this request. In the HAL app, connect the project folder (with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in its .env), then try again. Check Diagnostics to confirm 'Create ticket (this request): Available'." After creating a ticket via the tool, report the exact ticket ID and file path (e.g. docs/tickets/NNNN-title-slug.md) that was created.

**Moving a ticket to To Do:** When the user asks to move a ticket to To Do (e.g. "move this to To Do", "move ticket 0012 to To Do"), you MUST (1) fetch the ticket content with fetch_ticket_content (by ticket id), (2) evaluate readiness with evaluate_ticket_ready (pass the body_md from the fetch result). If the ticket is NOT ready, do NOT call kanban_move_ticket_to_todo; instead reply with a clear list of what is missing (use the missingItems from the evaluate_ticket_ready result). If the ticket IS ready, call kanban_move_ticket_to_todo with the ticket id. Then confirm in chat that the ticket was moved. The readiness checklist is in docs/process/ready-to-start-checklist.md (Goal, Human-verifiable deliverable, Acceptance criteria checkboxes, Constraints, Non-goals, no unresolved placeholders).

**Supabase is the source of truth for ticket content.** When the user asks to edit or fix a ticket, you must update the ticket in the database (do not suggest editing docs/tickets/*.md only). Use update_ticket_body to write the corrected body_md directly to Supabase. The change propagates out: the Kanban UI reflects it within ~10 seconds (poll interval). To propagate the same content to docs/tickets/*.md in the repo, use the sync_tickets tool (if available) after updating—sync writes from DB to docs so the repo files match Supabase.

**Editing a ticket (add section, change content, fix body):** When the user asks to edit ticket N or add content to ticket N (e.g. "add a section to ticket 0038", "edit ticket 0038"), you MUST: (1) call fetch_ticket_content with ticket_id N to get the current body_md, (2) call update_ticket_body with ticket_id N and body_md set to the full new body (current content plus the added or changed part). Do not offer a markdown snippet for the user to paste—perform the update yourself. If update_ticket_body is not in your tool list, tell the user: "Connect the project folder (with Supabase in .env) so I have the update_ticket_body tool; then I can edit the ticket in Supabase." When a ticket fails Definition of Ready and the user asks to fix it, use update_ticket_body with the full body including all required sections (Goal, Human-verifiable deliverable, Acceptance criteria with - [ ] checkboxes, Constraints, Non-goals). Optionally call sync_tickets afterward so docs/tickets/*.md match the database.

Always cite file paths when referencing specific content.`

const MAX_TOOL_ITERATIONS = 10
/** Cap on create_ticket retries when insert fails with unique/duplicate (id or filename). */
const MAX_CREATE_TICKET_RETRIES = 10

/** True if the error is a Postgres unique constraint violation (id or filename collision). */
function isUniqueViolation(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  if (err.code === '23505') return true
  const msg = (err.message ?? '').toLowerCase()
  return msg.includes('duplicate key') || msg.includes('unique constraint')
}
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
  let hasConversation = false
  if (config.conversationContextPack && config.conversationContextPack.trim() !== '') {
    sections.push('## Conversation so far\n\n' + config.conversationContextPack.trim())
    hasConversation = true
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
      hasConversation = true
    }
  }

  if (hasConversation) {
    sections.push('## User message (latest reply in the conversation above)\n\n' + userMessage)
  } else {
    sections.push('## User message\n\n' + userMessage)
  }

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

  sections.push('## Ticket template (required structure for create_ticket)')
  try {
    const templatePath = path.resolve(config.repoRoot, 'docs/templates/ticket.template.md')
    const templateContent = await fs.readFile(templatePath, 'utf8')
    sections.push(
      templateContent +
        '\n\nWhen creating a ticket, use this exact section structure. Replace every placeholder in angle brackets (e.g. `<what we want to achieve>`, `<AC 1>`) with concrete content—the resulting ticket must pass the Ready-to-start checklist (no unresolved placeholders, all required sections filled).'
    )
  } catch {
    sections.push('(docs/templates/ticket.template.md not found)')
  }

  sections.push('## Ready-to-start checklist (Definition of Ready)')
  try {
    const checklistPath = path.resolve(config.repoRoot, 'docs/process/ready-to-start-checklist.md')
    const content = await fs.readFile(checklistPath, 'utf8')
    sections.push(content)
  } catch {
    sections.push('(docs/process/ready-to-start-checklist.md not found)')
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

  const hasSupabase =
    typeof config.supabaseUrl === 'string' &&
    config.supabaseUrl.trim() !== '' &&
    typeof config.supabaseAnonKey === 'string' &&
    config.supabaseAnonKey.trim() !== ''

  const createTicketTool = hasSupabase
    ? (() => {
        const supabase: SupabaseClient = createClient(
          config.supabaseUrl!.trim(),
          config.supabaseAnonKey!.trim()
        )
        return tool({
          description:
            'Create a new ticket and store it in the Kanban board (Supabase). The ticket appears in Unassigned. Use when the user asks to create a ticket from the conversation. Provide the full markdown body using the exact structure from the Ticket template section in context: include Goal, Human-verifiable deliverable, Acceptance criteria (with - [ ] checkboxes), Constraints, and Non-goals. Replace every angle-bracket placeholder with concrete content so the ticket passes the Ready-to-start checklist (no <placeholders> left). Do not include an ID in the body—the tool assigns the next available ID. Do not write secrets or API keys.',
          parameters: z.object({
            title: z.string().describe('Short title for the ticket (used in filename slug)'),
            body_md: z
              .string()
              .describe(
                'Full markdown body with all required sections filled with concrete content. No angle-bracket placeholders (e.g. no <what we want to achieve>, <AC 1>). Must include: Goal (one sentence), Human-verifiable deliverable (UI-only), Acceptance criteria (UI-only) with - [ ] lines, Constraints, Non-goals. Must pass Ready-to-start checklist.'
              ),
          }),
          execute: async (input: { title: string; body_md: string }) => {
            type CreateResult =
              | {
                  success: true
                  id: string
                  filename: string
                  filePath: string
                  retried?: boolean
                  attempts?: number
                  ready: boolean
                  missingItems?: string[]
                }
              | { success: false; error: string }
            let out: CreateResult
            try {
              const { data: existingRows, error: fetchError } = await supabase
                .from('tickets')
                .select('id')
                .order('id', { ascending: true })
              if (fetchError) {
                out = { success: false, error: `Supabase fetch ids: ${fetchError.message}` }
                toolCalls.push({ name: 'create_ticket', input, output: out })
                return out
              }
              const ids = (existingRows ?? []).map((r) => r.id)
              const numericIds = ids
                .map((id) => {
                  const n = parseInt(id, 10)
                  return Number.isNaN(n) ? 0 : n
                })
                .filter((n) => n >= 0)
              const startNum = numericIds.length > 0 ? Math.max(...numericIds) + 1 : 1
              const slug = slugFromTitle(input.title)
              const now = new Date().toISOString()
              let lastInsertError: { code?: string; message?: string } | null = null
              for (let attempt = 1; attempt <= MAX_CREATE_TICKET_RETRIES; attempt++) {
                const candidateNum = startNum + attempt - 1
                const id = String(candidateNum).padStart(4, '0')
                const filename = `${id}-${slug}.md`
                const filePath = `docs/tickets/${filename}`
                const titleWithId = `${id} - ${input.title.trim()}`
                const { error: insertError } = await supabase.from('tickets').insert({
                  id,
                  filename,
                  title: titleWithId,
                  body_md: input.body_md.trim(),
                  kanban_column_id: 'col-unassigned',
                  kanban_position: 0,
                  kanban_moved_at: now,
                })
                if (!insertError) {
                  const readiness = evaluateTicketReady(input.body_md.trim())
                  out = {
                    success: true,
                    id,
                    filename,
                    filePath,
                    ...(attempt > 1 && { retried: true, attempts: attempt }),
                    ready: readiness.ready,
                    ...(readiness.missingItems.length > 0 && { missingItems: readiness.missingItems }),
                  }
                  toolCalls.push({ name: 'create_ticket', input, output: out })
                  return out
                }
                lastInsertError = insertError
                if (!isUniqueViolation(insertError)) {
                  out = { success: false, error: `Supabase insert: ${insertError.message}` }
                  toolCalls.push({ name: 'create_ticket', input, output: out })
                  return out
                }
              }
              out = {
                success: false,
                error: `Could not reserve a ticket ID after ${MAX_CREATE_TICKET_RETRIES} attempts (id/filename collision). Last: ${lastInsertError?.message ?? 'unknown'}`,
              }
            } catch (err) {
              out = {
                success: false,
                error: err instanceof Error ? err.message : String(err),
              }
            }
            toolCalls.push({ name: 'create_ticket', input, output: out })
            return out
          },
        })
      })()
    : null

  const fetchTicketContentTool =
    hasSupabase &&
    (() => {
      const supabase: SupabaseClient = createClient(
        config.supabaseUrl!.trim(),
        config.supabaseAnonKey!.trim()
      )
      return tool({
        description:
          'Fetch the full ticket content (body_md, title, id, kanban_column_id) for a ticket by id. Tries Supabase first, then repo docs/tickets/<id>-*.md. Use before evaluating readiness or when the user refers to a ticket by id.',
        parameters: z.object({
          ticket_id: z
            .string()
            .describe('Ticket id (e.g. "0012" or "12"). Will be normalized to 4-digit id.'),
        }),
        execute: async (input: { ticket_id: string }) => {
          const id = input.ticket_id.replace(/^0+/, '') || '0'
          const normalizedId = id.padStart(4, '0')
          type FetchResult =
            | { success: true; id: string; title: string; body_md: string; kanban_column_id: string | null }
            | { success: false; error: string }
          let out: FetchResult
          try {
            const { data: row, error } = await supabase
              .from('tickets')
              .select('id, title, body_md, kanban_column_id')
              .eq('id', normalizedId)
              .maybeSingle()
            if (!error && row) {
              out = {
                success: true,
                id: row.id,
                title: (row as { title?: string }).title ?? '',
                body_md: (row as { body_md?: string }).body_md ?? '',
                kanban_column_id: (row as { kanban_column_id?: string | null }).kanban_column_id ?? null,
              }
              toolCalls.push({ name: 'fetch_ticket_content', input, output: out })
              return out
            }
            const listOut = await listDirectory(ctx, { path: 'docs/tickets' })
            if ('error' in listOut) {
              out = { success: false, error: listOut.error }
              toolCalls.push({ name: 'fetch_ticket_content', input, output: out })
              return out
            }
            const match = (listOut.entries as string[]).find(
              (e) => e.startsWith(`${normalizedId}-`) && e.endsWith('.md')
            )
            if (!match) {
              out = { success: false, error: `Ticket ${normalizedId} not found in Supabase or docs/tickets.` }
              toolCalls.push({ name: 'fetch_ticket_content', input, output: out })
              return out
            }
            const readOut = await readFile(ctx, { path: `docs/tickets/${match}` })
            if ('error' in readOut) {
              out = { success: false, error: readOut.error }
              toolCalls.push({ name: 'fetch_ticket_content', input, output: out })
              return out
            }
            const content = (readOut as { content: string }).content
            const titleMatch = content.match(/\*\*Title\*\*:\s*(.+?)(?:\n|$)/)
            out = {
              success: true,
              id: normalizedId,
              title: titleMatch ? titleMatch[1].trim() : match.replace(/\.md$/i, ''),
              body_md: content,
              kanban_column_id: null,
            }
          } catch (err) {
            out = {
              success: false,
              error: err instanceof Error ? err.message : String(err),
            }
          }
          toolCalls.push({ name: 'fetch_ticket_content', input, output: out })
          return out
        },
      })
    })()

  const evaluateTicketReadyTool = tool({
    description:
      'Evaluate ticket body against the Ready-to-start checklist (Definition of Ready). Pass body_md from fetch_ticket_content. Returns ready (boolean), missingItems (list), and checklistResults. Always call this before kanban_move_ticket_to_todo; do not move if not ready.',
    parameters: z.object({
      body_md: z.string().describe('Full markdown body of the ticket (e.g. from fetch_ticket_content).'),
    }),
    execute: async (input: { body_md: string }) => {
      const out = evaluateTicketReady(input.body_md)
      toolCalls.push({ name: 'evaluate_ticket_ready', input: { body_md: input.body_md.slice(0, 500) + (input.body_md.length > 500 ? '...' : '') }, output: out })
      return out
    },
  })

  const updateTicketBodyTool =
    hasSupabase &&
    (() => {
      const supabase: SupabaseClient = createClient(
        config.supabaseUrl!.trim(),
        config.supabaseAnonKey!.trim()
      )
      return tool({
        description:
          'Update a ticket\'s body_md in Supabase directly. Supabase is the source of truth—this is how you edit a ticket; the Kanban UI reflects the change within ~10 seconds. Use when a ticket fails Definition of Ready or the user asks to edit/fix a ticket. Provide the full markdown body with all required sections: Goal (one sentence), Human-verifiable deliverable (UI-only), Acceptance criteria (UI-only) with - [ ] checkboxes, Constraints, Non-goals. No angle-bracket placeholders. After updating, use sync_tickets (if available) to propagate the change to docs/tickets/*.md.',
        parameters: z.object({
          ticket_id: z.string().describe('Ticket id (e.g. "0037").'),
          body_md: z
            .string()
            .describe(
              'Full markdown body with all required sections filled. No placeholders. Must pass Ready-to-start checklist.'
            ),
        }),
        execute: async (input: { ticket_id: string; body_md: string }) => {
          const normalizedId = input.ticket_id.replace(/^0+/, '0').padStart(4, '0')
          type UpdateResult =
            | { success: true; ticketId: string; ready: boolean; missingItems?: string[] }
            | { success: false; error: string }
          let out: UpdateResult
          try {
            const { data: row, error: fetchError } = await supabase
              .from('tickets')
              .select('id')
              .eq('id', normalizedId)
              .maybeSingle()
            if (fetchError) {
              out = { success: false, error: `Supabase fetch: ${fetchError.message}` }
              toolCalls.push({ name: 'update_ticket_body', input, output: out })
              return out
            }
            if (!row) {
              out = { success: false, error: `Ticket ${normalizedId} not found.` }
              toolCalls.push({ name: 'update_ticket_body', input, output: out })
              return out
            }
            const { error: updateError } = await supabase
              .from('tickets')
              .update({ body_md: input.body_md.trim() })
              .eq('id', normalizedId)
            if (updateError) {
              out = { success: false, error: `Supabase update: ${updateError.message}` }
            } else {
              const readiness = evaluateTicketReady(input.body_md.trim())
              out = {
                success: true,
                ticketId: normalizedId,
                ready: readiness.ready,
                ...(readiness.missingItems.length > 0 && { missingItems: readiness.missingItems }),
              }
            }
          } catch (err) {
            out = {
              success: false,
              error: err instanceof Error ? err.message : String(err),
            }
          }
          toolCalls.push({ name: 'update_ticket_body', input, output: out })
          return out
        },
      })
    })()

  const syncTicketsTool =
    hasSupabase &&
    (() => {
      const scriptPath = path.resolve(config.repoRoot, 'scripts', 'sync-tickets.js')
      const env = {
        ...process.env,
        SUPABASE_URL: config.supabaseUrl!.trim(),
        SUPABASE_ANON_KEY: config.supabaseAnonKey!.trim(),
      }
      return tool({
        description:
          'Run the sync-tickets script so docs/tickets/*.md match Supabase (DB → docs). Use after update_ticket_body or create_ticket so the repo files reflect the database. Supabase is the source of truth.',
        parameters: z.object({}),
        execute: async () => {
          type SyncResult = { success: true; message?: string } | { success: false; error: string }
          let out: SyncResult
          try {
            const { stdout, stderr } = await execAsync(`node ${JSON.stringify(scriptPath)}`, {
              cwd: config.repoRoot,
              env,
              maxBuffer: 100 * 1024,
            })
            const combined = [stdout, stderr].filter(Boolean).join('\n').trim()
            out = { success: true, ...(combined && { message: combined.slice(0, 500) }) }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err)
            out = { success: false, error: msg.slice(0, 500) }
          }
          toolCalls.push({ name: 'sync_tickets', input: {}, output: out })
          return out
        },
      })
    })()

  const kanbanMoveTicketToTodoTool =
    hasSupabase &&
    (() => {
      const supabase: SupabaseClient = createClient(
        config.supabaseUrl!.trim(),
        config.supabaseAnonKey!.trim()
      )
      const COL_UNASSIGNED = 'col-unassigned'
      const COL_TODO = 'col-todo'
      return tool({
        description:
          'Move a ticket from Unassigned to To Do on the kanban board. Only call after evaluate_ticket_ready returns ready: true. Fails if the ticket is not in Unassigned.',
        parameters: z.object({
          ticket_id: z.string().describe('Ticket id (e.g. "0012").'),
        }),
        execute: async (input: { ticket_id: string }) => {
          const normalizedId = input.ticket_id.replace(/^0+/, '0').padStart(4, '0')
          type MoveResult =
            | { success: true; ticketId: string; fromColumn: string; toColumn: string }
            | { success: false; error: string }
          let out: MoveResult
          try {
            const { data: row, error: fetchError } = await supabase
              .from('tickets')
              .select('id, kanban_column_id, kanban_position')
              .eq('id', normalizedId)
              .maybeSingle()
            if (fetchError) {
              out = { success: false, error: `Supabase fetch: ${fetchError.message}` }
              toolCalls.push({ name: 'kanban_move_ticket_to_todo', input, output: out })
              return out
            }
            if (!row) {
              out = { success: false, error: `Ticket ${normalizedId} not found.` }
              toolCalls.push({ name: 'kanban_move_ticket_to_todo', input, output: out })
              return out
            }
            const currentCol = (row as { kanban_column_id?: string | null }).kanban_column_id ?? null
            const inUnassigned =
              currentCol === COL_UNASSIGNED || currentCol === null || currentCol === ''
            if (!inUnassigned) {
              out = {
                success: false,
                error: `Ticket is not in Unassigned (current column: ${currentCol ?? 'null'}). Only tickets in Unassigned can be moved to To Do.`,
              }
              toolCalls.push({ name: 'kanban_move_ticket_to_todo', input, output: out })
              return out
            }
            const { data: todoRows } = await supabase
              .from('tickets')
              .select('kanban_position')
              .eq('kanban_column_id', COL_TODO)
              .order('kanban_position', { ascending: false })
              .limit(1)
            const maxPos = (todoRows ?? []).reduce(
              (acc, r) => Math.max(acc, (r as { kanban_position?: number }).kanban_position ?? 0),
              0
            )
            const newPosition = maxPos + 1
            const now = new Date().toISOString()
            const { error: updateError } = await supabase
              .from('tickets')
              .update({
                kanban_column_id: COL_TODO,
                kanban_position: newPosition,
                kanban_moved_at: now,
              })
              .eq('id', normalizedId)
            if (updateError) {
              out = { success: false, error: `Supabase update: ${updateError.message}` }
            } else {
              out = {
                success: true,
                ticketId: normalizedId,
                fromColumn: COL_UNASSIGNED,
                toColumn: COL_TODO,
              }
            }
          } catch (err) {
            out = {
              success: false,
              error: err instanceof Error ? err.message : String(err),
            }
          }
          toolCalls.push({ name: 'kanban_move_ticket_to_todo', input, output: out })
          return out
        },
      })
    })()

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
    ...(createTicketTool ? { create_ticket: createTicketTool } : {}),
    ...(fetchTicketContentTool ? { fetch_ticket_content: fetchTicketContentTool } : {}),
    evaluate_ticket_ready: evaluateTicketReadyTool,
    ...(updateTicketBodyTool ? { update_ticket_body: updateTicketBodyTool } : {}),
    ...(syncTicketsTool ? { sync_tickets: syncTicketsTool } : {}),
    ...(kanbanMoveTicketToTodoTool ? { kanban_move_ticket_to_todo: kanbanMoveTicketToTodoTool } : {}),
  }

  const toolNames = Object.keys(tools).join(', ')
  const hasUpdateTicketBody = 'update_ticket_body' in tools
  const toolsHint =
    toolNames.length > 0
      ? `**Tools for this request:** You have: ${toolNames}.${hasUpdateTicketBody ? ' Use update_ticket_body when the user asks to edit a ticket or add content to a ticket.' : ''} (This list is the only source of truth for which tools you have—ignore any other document that says otherwise.)\n\n`
      : ''
  const prompt = `${contextPack}\n\n---\n\n${toolsHint}Respond to the user message above using the tools as needed.`

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

    let reply = result.text ?? ''
    // If the model returned no text but create_ticket succeeded, provide a fallback so the user sees a clear outcome (0011/0020)
    if (!reply.trim()) {
      const createTicketCall = toolCalls.find(
        (c) =>
          c.name === 'create_ticket' &&
          typeof c.output === 'object' &&
          c.output !== null &&
          (c.output as { success?: boolean }).success === true
      )
      if (createTicketCall) {
        const out = createTicketCall.output as {
          id: string
          filename: string
          filePath: string
          ready?: boolean
          missingItems?: string[]
        }
        reply = `I created ticket **${out.id}** at \`${out.filePath}\`. It should appear in the Kanban board under Unassigned (sync may run automatically).`
        if (out.ready === false && out.missingItems?.length) {
          reply += ` The ticket is not yet ready for To Do: ${out.missingItems.join('; ')}. Update the ticket or ask me to move it once it passes the Ready-to-start checklist.`
        }
      } else {
        const moveCall = toolCalls.find(
          (c) =>
            c.name === 'kanban_move_ticket_to_todo' &&
            typeof c.output === 'object' &&
            c.output !== null &&
            (c.output as { success?: boolean }).success === true
        )
        if (moveCall) {
          const out = moveCall.output as { ticketId: string; fromColumn: string; toColumn: string }
          reply = `I moved ticket **${out.ticketId}** from ${out.fromColumn} to **${out.toColumn}**. It should now appear under To Do on the Kanban board.`
        } else {
          const updateBodyCall = toolCalls.find(
            (c) =>
              c.name === 'update_ticket_body' &&
              typeof c.output === 'object' &&
              c.output !== null &&
              (c.output as { success?: boolean }).success === true
          )
          if (updateBodyCall) {
            const out = updateBodyCall.output as {
              ticketId: string
              ready?: boolean
              missingItems?: string[]
            }
            reply = `I updated the body of ticket **${out.ticketId}** in Supabase. The Kanban UI will reflect the change within ~10 seconds.`
            if (out.ready === false && out.missingItems?.length) {
              reply += ` Note: the ticket may still not pass readiness: ${out.missingItems.join('; ')}.`
            }
          } else {
            const syncTicketsCall = toolCalls.find(
              (c) =>
                c.name === 'sync_tickets' &&
                typeof c.output === 'object' &&
                c.output !== null &&
                (c.output as { success?: boolean }).success === true
            )
            if (syncTicketsCall) {
              reply =
                'I ran sync-tickets. docs/tickets/*.md now match Supabase (Supabase is the source of truth).'
            }
          }
        }
      }
    }
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
