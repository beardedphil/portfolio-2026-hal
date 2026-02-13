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
import crypto from 'node:crypto'
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

function isUnknownColumnError(err: unknown): boolean {
  const e = err as { code?: string; message?: string }
  const msg = (e?.message ?? '').toLowerCase()
  return e?.code === '42703' || (msg.includes('column') && msg.includes('does not exist'))
}

function repoHintPrefix(repoFullName: string): string {
  const repo = repoFullName.split('/').pop() ?? repoFullName
  const tokens = repo
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter(Boolean)

  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i]
    if (!/[a-z]/.test(t)) continue
    if (t.length >= 2 && t.length <= 6) return t.toUpperCase()
  }

  const letters = repo.replace(/[^a-zA-Z]/g, '').toUpperCase()
  return (letters.slice(0, 4) || 'PRJ').toUpperCase()
}

function parseTicketNumber(ref: string): number | null {
  const s = String(ref ?? '').trim()
  if (!s) return null
  const m = s.match(/(\d{1,4})(?!.*\d)/) // last 1-4 digit run
  if (!m) return null
  const n = parseInt(m[1], 10)
  return Number.isFinite(n) ? n : null
}

/** Normalize body so Ready-to-start evaluator finds sections: ## and exact titles (LLMs often output # or shortened titles). */
function normalizeBodyForReady(bodyMd: string): string {
  let out = bodyMd.trim()
  const replacements: [RegExp, string][] = [
    [/^# Goal\s*$/gm, '## Goal (one sentence)'],
    [/^# Human-verifiable deliverable\s*$/gm, '## Human-verifiable deliverable (UI-only)'],
    [/^# Acceptance criteria\s*$/gm, '## Acceptance criteria (UI-only)'],
    [/^# Constraints\s*$/gm, '## Constraints'],
    [/^# Non-goals\s*$/gm, '## Non-goals'],
  ]
  for (const [re, replacement] of replacements) {
    out = out.replace(re, replacement)
  }
  return out
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

/** Normalize Title line in body_md to include ID prefix: "<ID> — <title>". Returns normalized body_md. */
function normalizeTitleLineInBody(bodyMd: string, ticketId: string): string {
  if (!bodyMd || !ticketId) return bodyMd
  const idPrefix = `${ticketId} — `
  // Match the Title line: "- **Title**: ..."
  const titleLineRegex = /(- \*\*Title\*\*:\s*)(.+?)(?:\n|$)/
  const match = bodyMd.match(titleLineRegex)
  if (!match) return bodyMd // No Title line found, return as-is
  
  const prefix = match[1] // "- **Title**: "
  let titleValue = match[2].trim()
  
  // Remove any existing ID prefix (e.g. "0048 — " or "HAL-0048 - ")
  titleValue = titleValue.replace(/^(?:[A-Za-z0-9]{2,10}-)?\d{4}\s*[—–-]\s*/, '')
  
  // Prepend the correct ID prefix
  const normalizedTitle = `${idPrefix}${titleValue}`
  const normalizedLine = `${prefix}${normalizedTitle}${match[0].endsWith('\n') ? '\n' : ''}`
  
  return bodyMd.replace(titleLineRegex, normalizedLine)
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
    // Repo-scoped safe mode (0079): use pk for updates; keep legacy fallback if schema isn't migrated.
    const r = await supabase
      .from('tickets')
      .select('pk, id, display_id, repo_full_name, ticket_number, title, body_md, kanban_column_id')
      .order('repo_full_name', { ascending: true })
      .order('ticket_number', { ascending: true })
    let rows = r.data as any[] | null
    let fetchError = r.error as any
    if (fetchError && isUnknownColumnError(fetchError)) {
      const legacy = await supabase
        .from('tickets')
        .select('id, title, body_md, kanban_column_id')
        .order('id', { ascending: true })
      rows = legacy.data as any[] | null
      fetchError = legacy.error as any
    }

    if (fetchError) {
      return { moved: [], notReady: [], error: `Supabase fetch: ${fetchError.message}` }
    }

    const unassigned = (rows ?? []).filter(
      (r: { kanban_column_id?: string | null }) =>
        r.kanban_column_id === COL_UNASSIGNED ||
        r.kanban_column_id == null ||
        r.kanban_column_id === ''
    )

    const now = new Date().toISOString()
    // Group by repo when available; otherwise treat as single bucket.
    const groups = new Map<string, any[]>()
    for (const row of unassigned) {
      const repo = (row as any).repo_full_name ?? 'legacy/unknown'
      const arr = groups.get(repo) ?? []
      arr.push(row)
      groups.set(repo, arr)
    }

    for (const [repo, rowsInRepo] of groups.entries()) {
      // Compute next position within this repo's To Do column if schema supports repo scoping; else global.
      let nextTodoPosition = 0
      const todoQ = supabase
        .from('tickets')
        .select('kanban_position')
        .eq('kanban_column_id', COL_TODO)
      const hasRepoCol = (rowsInRepo[0] as any).repo_full_name != null
      const todoR = hasRepoCol
        ? await todoQ.eq('repo_full_name', repo).order('kanban_position', { ascending: false }).limit(1)
        : await todoQ.order('kanban_position', { ascending: false }).limit(1)
      if (todoR.error && isUnknownColumnError(todoR.error)) {
        // Legacy schema: ignore repo filter
        const legacyTodo = await supabase
          .from('tickets')
          .select('kanban_position')
          .eq('kanban_column_id', COL_TODO)
          .order('kanban_position', { ascending: false })
          .limit(1)
        if (legacyTodo.error) {
          return { moved: [], notReady: [], error: `Supabase fetch: ${legacyTodo.error.message}` }
        }
        const max = (legacyTodo.data ?? []).reduce(
          (acc, r) => Math.max(acc, (r as { kanban_position?: number }).kanban_position ?? 0),
          0
        )
        nextTodoPosition = max + 1
      } else if (todoR.error) {
        return { moved: [], notReady: [], error: `Supabase fetch: ${todoR.error.message}` }
      } else {
        const max = (todoR.data ?? []).reduce(
          (acc, r) => Math.max(acc, (r as { kanban_position?: number }).kanban_position ?? 0),
          0
        )
        nextTodoPosition = max + 1
      }

      for (const row of rowsInRepo) {
        const id = (row as { id: string }).id
        const displayId = (row as any).display_id
        const title = (row as { title?: string }).title
        const bodyMd = (row as { body_md?: string }).body_md ?? ''
        const result = evaluateTicketReady(bodyMd)
        if (result.ready) {
          const updateQ = supabase
            .from('tickets')
            .update({
              kanban_column_id: COL_TODO,
              kanban_position: nextTodoPosition++,
              kanban_moved_at: now,
            })
          const upd = (row as any).pk
            ? await updateQ.eq('pk', (row as any).pk)
            : await updateQ.eq('id', id)
          if (!upd.error) moved.push(displayId ?? id)
        } else {
          notReady.push({ id: displayId ?? id, title, missingItems: result.missingItems })
        }
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
  /** Project identifier (e.g. repo full_name when connected via GitHub). */
  projectId?: string
  /** Repo full_name (owner/repo) when connected via GitHub. Enables read_file/search_files via GitHub API. */
  repoFullName?: string
  /** Read file from connected GitHub repo. When set, used instead of local FS for project files. */
  githubReadFile?: (path: string, maxLines?: number) => Promise<{ content: string } | { error: string }>
  /** Search code in connected GitHub repo. When set, used instead of local FS for project search. */
  githubSearchCode?: (
    pattern: string,
    glob?: string
  ) => Promise<{ matches: Array<{ path: string; line: number; text: string }> } | { error: string }>
  /** List directory contents in connected GitHub repo. When set, used instead of local FS for directory listing. */
  githubListDirectory?: (path: string) => Promise<{ entries: string[] } | { error: string }>
  /** Image attachments to include in the request (base64 data URLs). */
  images?: Array<{ dataUrl: string; filename: string; mimeType: string }>
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
  /** Debug: which repo was used for each tool call (0119) */
  _repoUsage?: Array<{ tool: string; usedGitHub: boolean; path?: string }>
}

const PM_SYSTEM_INSTRUCTIONS = `You are the Project Manager agent for HAL. Your job is to help users understand the codebase, review tickets, and provide project guidance.

You have access to read-only tools to explore the repository. Use them to answer questions about code, tickets, and project state.

**Repository access:** 
- **CRITICAL**: When a GitHub repo is connected (user clicked "Connect GitHub Repo"), you MUST use read_file and search_files to inspect the connected repo via GitHub API (committed code on the default branch). The connected repo is NOT the HAL repository.
- If a GitHub repo is connected, the tool descriptions will say "connected GitHub repo" - use those tools to access the user's project, NOT the HAL repo.
- When answering questions about the user's project, you MUST use the connected GitHub repo. Do NOT reference or use files from the HAL repository (portfolio-2026-hal) when a GitHub repo is connected.
- If no repo is connected, these tools will only access the HAL repository itself (the workspace where HAL runs).
- If the user's question is about their project and no repo is connected, explain: "Connect a GitHub repository in the HAL app to enable repository inspection. Once connected, I can search and read files from your repo."
- Always cite specific file paths when referencing code or content (e.g., "In src/App.tsx line 42...").
- **When a GitHub repo is connected, do NOT answer questions using HAL repo files. Use the connected repo instead.**
- **When a GitHub repo is connected, do NOT mention "HAL repo" or "portfolio-2026-hal" in your responses unless the user explicitly asks about HAL itself.**

**Conversation context:** When "Conversation so far" is present, the "User message" is the user's latest reply in that conversation. Short replies (e.g. "Entirely, in all states", "Yes", "The first one", "inside the embedded kanban UI") are almost always answers to the question you (the assistant) just asked—interpret them in that context. Do not treat short user replies as a new top-level request about repo rules, process, or "all states" enforcement unless the conversation clearly indicates otherwise.

**Creating tickets:** When the user **explicitly** asks to create a ticket (e.g. "create a ticket", "create ticket for that", "create a new ticket for X"), you MUST call the create_ticket tool if it is available. Do NOT call create_ticket for short, non-actionable messages such as: "test", "ok", "hi", "hello", "thanks", "cool", "checking", "asdf", or similar—these are usually the user testing the UI, acknowledging, or typing casually. Do not infer a ticket-creation request from context alone (e.g. if the user sends "Test" while testing the chat UI, that does NOT mean create the chat UI ticket). Calling the tool is what actually creates the ticket—do not only write the ticket content in your message. Use create_ticket with a short title (without the ID prefix—the tool assigns the next repo-scoped ID and normalizes the Title line to "PREFIX-NNNN — ..."). Provide a full markdown body following the repo ticket template. Do not invent an ID—the tool assigns it. Do not write secrets or API keys into the ticket body. If create_ticket is not in your tool list, tell the user: "I don't have the create-ticket tool for this request. In the HAL app, connect the project folder (with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in its .env), then try again. Check Diagnostics to confirm 'Create ticket (this request): Available'." After creating a ticket via the tool, report the exact ticket display ID (e.g. HAL-0079) and the returned filePath (Supabase-only).

**Moving a ticket to To Do:** When the user asks to move a ticket to To Do (e.g. "move this to To Do", "move ticket 0012 to To Do"), you MUST (1) fetch the ticket content with fetch_ticket_content (by ticket id), (2) evaluate readiness with evaluate_ticket_ready (pass the body_md from the fetch result). If the ticket is NOT ready, do NOT call kanban_move_ticket_to_todo; instead reply with a clear list of what is missing (use the missingItems from the evaluate_ticket_ready result). If the ticket IS ready, call kanban_move_ticket_to_todo with the ticket id. Then confirm in chat that the ticket was moved. The readiness checklist is in docs/process/ready-to-start-checklist.md (Goal, Human-verifiable deliverable, Acceptance criteria checkboxes, Constraints, Non-goals, no unresolved placeholders).

**Preparing a ticket (Definition of Ready):** When the user asks to "prepare ticket X" or "get ticket X ready" (e.g. from "Prepare top ticket" button), you MUST (1) fetch the ticket content with fetch_ticket_content, (2) evaluate readiness with evaluate_ticket_ready. If the ticket is NOT ready, use update_ticket_body to fix formatting issues (normalize headings, convert bullets to checkboxes in Acceptance criteria if needed, ensure all required sections exist). After updating, re-evaluate with evaluate_ticket_ready. If the ticket IS ready (after fixes if needed), automatically call kanban_move_ticket_to_todo to move it to To Do. Then confirm in chat that the ticket is Ready-to-start and has been moved to To Do. If the ticket cannot be made ready (e.g. missing required content that cannot be auto-generated), clearly explain what is missing and that the ticket remains in Unassigned.

**Listing tickets by column:** When the user asks to see tickets in a specific Kanban column (e.g. "list tickets in QA column", "what tickets are in QA", "show me tickets in the QA column"), use list_tickets_by_column with the appropriate column_id (e.g. "col-qa" for QA, "col-todo" for To Do, "col-unassigned" for Unassigned, "col-human-in-the-loop" for Human in the Loop). Format the results clearly in your reply, showing ticket ID and title for each ticket. This helps you see which tickets are currently in a given column so you can update other tickets without asking the user for IDs.

**Moving tickets to other repositories:** When the user asks to move a ticket to another repository's To Do column (e.g. "Move ticket HAL-0012 to owner/other-repo To Do"), use kanban_move_ticket_to_other_repo_todo with the ticket_id and target_repo_full_name. This tool works from any Kanban column (not only Unassigned). The ticket will be moved to the target repository and placed in its To Do column, and the ticket's display_id will be updated to match the target repo's prefix. If the target repo does not exist or the user lacks access, the tool will return a clear error message. If the ticket ID is invalid or not found, the tool will return a clear error message. After a successful move, confirm in chat the target repository and that the ticket is now in To Do.

**Listing available repositories:** When the user asks "what repos can I move tickets to?" or similar questions about available target repositories, use list_available_repos to get a list of all repositories (repo_full_name) that have tickets in the database. Format the results clearly in your reply, showing the repository names.

**Supabase is the source of truth for ticket content.** When the user asks to edit or fix a ticket, you must update the ticket in the database (do not suggest editing docs/tickets/*.md only). Use update_ticket_body to write the corrected body_md directly to Supabase. The change propagates out: the Kanban UI reflects it within ~10 seconds (poll interval). To propagate the same content to docs/tickets/*.md in the repo, use the sync_tickets tool (if available) after updating—sync writes from DB to docs so the repo files match Supabase.

**Editing ticket body in Supabase:** When a ticket in Unassigned fails the Definition of Ready (missing sections, placeholders, etc.) and the user asks to fix it or make it ready, use update_ticket_body to write the corrected body_md directly to Supabase. Provide the full markdown body with all required sections: Goal (one sentence), Human-verifiable deliverable (UI-only), Acceptance criteria (UI-only) with - [ ] checkboxes, Constraints, Non-goals. Replace every placeholder with concrete content. The Kanban UI reflects updates within ~10 seconds. Optionally call sync_tickets afterward so docs/tickets/*.md match the database.

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
            'Create a new ticket and store it in the Kanban board (Supabase). The ticket appears in Unassigned. Use when the user asks to create a ticket from the conversation. Provide the full markdown body using the exact structure from the Ticket template section in context: include Goal, Human-verifiable deliverable, Acceptance criteria (with - [ ] checkboxes), Constraints, and Non-goals. Replace every angle-bracket placeholder with concrete content so the ticket passes the Ready-to-start checklist (no <placeholders> left). Do not include an ID in the body—the tool assigns the next available ID for the connected repo and normalizes the Title line to "PREFIX-NNNN — <title>" (e.g. "HAL-0050 — Your Title"). Do not write secrets or API keys.',
          parameters: z.object({
            title: z.string().describe('Short title for the ticket (without ID prefix; the tool automatically formats it as "NNNN — Your Title")'),
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
                  display_id?: string
                  ticket_number?: number
                  repo_full_name?: string
                  filename: string
                  filePath: string
                  retried?: boolean
                  attempts?: number
                  ready: boolean
                  missingItems?: string[]
                }
              | { success: false; error: string; detectedPlaceholders?: string[] }
            let out: CreateResult
            try {
              // Validate for unresolved placeholders BEFORE any database operations (0066)
              let bodyMdTrimmed = input.body_md.trim()
              const placeholders = bodyMdTrimmed.match(PLACEHOLDER_RE) ?? []
              if (placeholders.length > 0) {
                const uniquePlaceholders = [...new Set(placeholders)]
                out = {
                  success: false,
                  error: `Ticket creation rejected: unresolved template placeholder tokens detected. Detected placeholders: ${uniquePlaceholders.join(', ')}. Replace all angle-bracket placeholders with concrete content before creating the ticket.`,
                  detectedPlaceholders: uniquePlaceholders,
                }
                toolCalls.push({ name: 'create_ticket', input, output: out })
                return out
              }
              // Normalize headings so stored ticket passes Ready-to-start (## and exact section titles)
              bodyMdTrimmed = normalizeBodyForReady(bodyMdTrimmed)

              const repoFullName =
                typeof config.projectId === 'string' && config.projectId.trim() ? config.projectId.trim() : 'legacy/unknown'
              const prefix = repoHintPrefix(repoFullName)

              // Prefer repo-scoped IDs (0079): max(ticket_number) per repo
              let startNum = 1
              {
                const { data, error } = await supabase
                  .from('tickets')
                  .select('ticket_number')
                  .eq('repo_full_name', repoFullName)
                  .order('ticket_number', { ascending: false })
                  .limit(1)
                if (error) {
                  if (!isUnknownColumnError(error)) {
                    out = { success: false, error: `Supabase fetch max ticket_number: ${error.message}` }
                    toolCalls.push({ name: 'create_ticket', input, output: out })
                    return out
                  }

                  // Legacy fallback: max(id) across all tickets
                  const { data: existingRows, error: fetchError } = await supabase
                    .from('tickets')
                    .select('id')
                    .order('id', { ascending: true })
                  if (fetchError) {
                    out = { success: false, error: `Supabase fetch ids: ${fetchError.message}` }
                    toolCalls.push({ name: 'create_ticket', input, output: out })
                    return out
                  }
                  const ids = (existingRows ?? []).map((r) => (r as { id?: string }).id ?? '')
                  const numericIds = ids
                    .map((id) => {
                      const n = parseInt(id, 10)
                      return Number.isNaN(n) ? 0 : n
                    })
                    .filter((n) => n >= 0)
                  startNum = numericIds.length > 0 ? Math.max(...numericIds) + 1 : 1
                } else {
                  const maxN = (data?.[0] as { ticket_number?: number } | undefined)?.ticket_number
                  startNum = typeof maxN === 'number' && Number.isFinite(maxN) ? maxN + 1 : 1
                }
              }
              const slug = slugFromTitle(input.title)
              const now = new Date().toISOString()
              let lastInsertError: { code?: string; message?: string } | null = null
              for (let attempt = 1; attempt <= MAX_CREATE_TICKET_RETRIES; attempt++) {
                const candidateNum = startNum + attempt - 1
                const id = String(candidateNum).padStart(4, '0') // legacy string id
                const displayId = `${prefix}-${id}`
                const filename = `${id}-${slug}.md`
                const filePath = `supabase:tickets/${displayId}`
                // Normalize Title line in body_md to include ID prefix (0054)
                const normalizedBodyMd = normalizeTitleLineInBody(bodyMdTrimmed, displayId)
                // Re-validate after normalization (normalization shouldn't introduce placeholders, but check anyway)
                const normalizedPlaceholders = normalizedBodyMd.match(PLACEHOLDER_RE) ?? []
                if (normalizedPlaceholders.length > 0) {
                  const uniquePlaceholders = [...new Set(normalizedPlaceholders)]
                  out = {
                    success: false,
                    error: `Ticket creation rejected: unresolved template placeholder tokens detected after normalization. Detected placeholders: ${uniquePlaceholders.join(', ')}. Replace all angle-bracket placeholders with concrete content before creating the ticket.`,
                    detectedPlaceholders: uniquePlaceholders,
                  }
                  toolCalls.push({ name: 'create_ticket', input, output: out })
                  return out
                }
                // New schema insert (0079). If DB isn't migrated, fall back to legacy insert.
                let insertError: { code?: string; message?: string } | null = null
                {
                  const r = await supabase.from('tickets').insert({
                    pk: crypto.randomUUID(),
                    repo_full_name: repoFullName,
                    ticket_number: candidateNum,
                    display_id: displayId,
                    id,
                    filename,
                    title: input.title.trim(),
                    body_md: normalizedBodyMd,
                    kanban_column_id: 'col-unassigned',
                    kanban_position: 0,
                    kanban_moved_at: now,
                  } as any)
                  insertError = (r.error as any) ?? null
                  if (insertError && isUnknownColumnError(insertError)) {
                    const legacy = await supabase.from('tickets').insert({
                      pk: crypto.randomUUID(),
                      id,
                      filename,
                      title: `${id} — ${input.title.trim()}`,
                      body_md: normalizeTitleLineInBody(bodyMdTrimmed, id),
                      kanban_column_id: 'col-unassigned',
                      kanban_position: 0,
                      kanban_moved_at: now,
                    } as any)
                    insertError = (legacy.error as any) ?? null
                  }
                }
                if (!insertError) {
                  // Auto-fix: normalize and re-evaluate (0095)
                  let finalBodyMd = normalizedBodyMd
                  let readiness = evaluateTicketReady(finalBodyMd)
                  let autoFixed = false
                  
                  // If not ready after normalization, try to auto-fix common formatting issues
                  if (!readiness.ready) {
                    // Try to fix missing checkboxes in Acceptance criteria
                    const acSection = sectionContent(finalBodyMd, 'Acceptance criteria (UI-only)')
                    if (acSection && !/-\s*\[\s*\]/.test(acSection) && /^[\s]*[-*+]\s+/m.test(acSection)) {
                      // If AC section exists, has bullets but no checkboxes, convert bullets to checkboxes
                      const fixedAc = acSection.replace(/^(\s*)[-*+]\s+/gm, '$1- [ ] ')
                      const acRegex = new RegExp(
                        `(##\\s+Acceptance criteria \\(UI-only\\)\\s*\\n)([\\s\\S]*?)(?=\\n## |$)`,
                        'i'
                      )
                      const match = finalBodyMd.match(acRegex)
                      if (match) {
                        finalBodyMd = finalBodyMd.replace(acRegex, `$1${fixedAc}\n`)
                        autoFixed = true
                        // Re-evaluate after fix
                        readiness = evaluateTicketReady(finalBodyMd)
                        
                        // If fix made it ready, update the ticket in DB
                        if (readiness.ready) {
                          const updateQ = supabase.from('tickets').update({ body_md: finalBodyMd })
                          const updateResult = repoFullName !== 'legacy/unknown' && candidateNum
                            ? await updateQ.eq('repo_full_name', repoFullName).eq('ticket_number', candidateNum)
                            : await updateQ.eq('id', id)
                          if (updateResult.error) {
                            // Fix worked but update failed - revert to original
                            finalBodyMd = normalizedBodyMd
                            readiness = evaluateTicketReady(finalBodyMd)
                            autoFixed = false
                          }
                        }
                      }
                    }
                  }
                  
                  // Auto-move to To Do if ready (0083, 0095)
                  let movedToTodo = false
                  let moveError: string | undefined = undefined
                  if (readiness.ready) {
                    try {
                      // Compute next position in To Do column
                      let nextTodoPosition = 0
                      const todoQ = supabase
                        .from('tickets')
                        .select('kanban_position')
                        .eq('kanban_column_id', COL_TODO)
                      const todoR = repoFullName !== 'legacy/unknown'
                        ? await todoQ.eq('repo_full_name', repoFullName).order('kanban_position', { ascending: false }).limit(1)
                        : await todoQ.order('kanban_position', { ascending: false }).limit(1)
                      
                      if (todoR.error && isUnknownColumnError(todoR.error)) {
                        // Legacy fallback
                        const legacyTodo = await supabase
                          .from('tickets')
                          .select('kanban_position')
                          .eq('kanban_column_id', COL_TODO)
                          .order('kanban_position', { ascending: false })
                          .limit(1)
                        if (legacyTodo.error) {
                          moveError = `Failed to fetch To Do position: ${legacyTodo.error.message}`
                        } else {
                          const max = (legacyTodo.data ?? []).reduce(
                            (acc, r) => Math.max(acc, (r as { kanban_position?: number }).kanban_position ?? 0),
                            0
                          )
                          nextTodoPosition = max + 1
                        }
                      } else if (todoR.error) {
                        moveError = `Failed to fetch To Do position: ${todoR.error.message}`
                      } else {
                        const max = (todoR.data ?? []).reduce(
                          (acc, r) => Math.max(acc, (r as { kanban_position?: number }).kanban_position ?? 0),
                          0
                        )
                        nextTodoPosition = max + 1
                      }
                      
                      if (!moveError) {
                        // Update ticket to To Do
                        const now = new Date().toISOString()
                        const updateQ = supabase
                          .from('tickets')
                          .update({
                            kanban_column_id: COL_TODO,
                            kanban_position: nextTodoPosition,
                            kanban_moved_at: now,
                          })
                        
                        const updateResult = repoFullName !== 'legacy/unknown' && candidateNum
                          ? await updateQ.eq('repo_full_name', repoFullName).eq('ticket_number', candidateNum)
                          : await updateQ.eq('id', id)
                        
                        if (updateResult.error) {
                          moveError = `Failed to move to To Do: ${updateResult.error.message}`
                        } else {
                          movedToTodo = true
                        }
                      }
                    } catch (moveErr) {
                      moveError = moveErr instanceof Error ? moveErr.message : String(moveErr)
                    }
                  }
                  
                  out = {
                    success: true,
                    id,
                    display_id: displayId,
                    ticket_number: candidateNum,
                    repo_full_name: repoFullName,
                    filename,
                    filePath,
                    ...(attempt > 1 && { retried: true, attempts: attempt }),
                    ready: readiness.ready,
                    ...(readiness.missingItems.length > 0 && { missingItems: readiness.missingItems }),
                    ...(autoFixed && { autoFixed: true }),
                    ...(movedToTodo && { movedToTodo: true }),
                    ...(moveError && { moveError }),
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
          'Fetch the full ticket content (body_md, title, id/display_id, kanban_column_id) for a ticket from Supabase. Supabase-only mode (0065). In repo-scoped mode (0079), tickets are resolved by (repo_full_name, ticket_number).',
        parameters: z.object({
          ticket_id: z
            .string()
            .describe('Ticket reference (e.g. "HAL-0012", "0012", or "12").'),
        }),
        execute: async (input: { ticket_id: string }) => {
          const ticketNumber = parseTicketNumber(input.ticket_id)
          const normalizedId = String(ticketNumber ?? 0).padStart(4, '0')
          type FetchResult =
            | {
                success: true
                id: string
                display_id?: string
                ticket_number?: number
                repo_full_name?: string
                title: string
                body_md: string
                kanban_column_id: string | null
              }
            | { success: false; error: string }
          let out: FetchResult
          try {
            if (!ticketNumber) {
              out = { success: false, error: `Could not parse ticket number from "${input.ticket_id}".` }
              toolCalls.push({ name: 'fetch_ticket_content', input, output: out })
              return out
            }

            const repoFullName =
              typeof config.projectId === 'string' && config.projectId.trim() ? config.projectId.trim() : ''
            if (repoFullName) {
              const { data: row, error } = await supabase
                .from('tickets')
                .select('id, display_id, ticket_number, repo_full_name, title, body_md, kanban_column_id')
                .eq('repo_full_name', repoFullName)
                .eq('ticket_number', ticketNumber)
                .maybeSingle()
              if (!error && row) {
                out = {
                  success: true,
                  id: (row as any).id,
                  display_id: (row as any).display_id ?? undefined,
                  ticket_number: (row as any).ticket_number ?? undefined,
                  repo_full_name: (row as any).repo_full_name ?? undefined,
                  title: (row as any).title ?? '',
                  body_md: (row as any).body_md ?? '',
                  kanban_column_id: (row as any).kanban_column_id ?? null,
                }
                toolCalls.push({ name: 'fetch_ticket_content', input, output: out })
                return out
              }
              if (error && isUnknownColumnError(error)) {
                // Legacy schema fallback: global id
                const { data: legacyRow, error: legacyErr } = await supabase
                  .from('tickets')
                  .select('id, title, body_md, kanban_column_id')
                  .eq('id', normalizedId)
                  .maybeSingle()
                if (!legacyErr && legacyRow) {
                  out = {
                    success: true,
                    id: (legacyRow as any).id,
                    title: (legacyRow as any).title ?? '',
                    body_md: (legacyRow as any).body_md ?? '',
                    kanban_column_id: (legacyRow as any).kanban_column_id ?? null,
                  }
                  toolCalls.push({ name: 'fetch_ticket_content', input, output: out })
                  return out
                }
              }
            } else {
              // If no repo is connected, keep legacy behavior (global id) so "legacy/unknown" tickets remain reachable.
              const { data: legacyRow, error: legacyErr } = await supabase
                .from('tickets')
                .select('id, title, body_md, kanban_column_id')
                .eq('id', normalizedId)
                .maybeSingle()
              if (!legacyErr && legacyRow) {
                out = {
                  success: true,
                  id: (legacyRow as any).id,
                  title: (legacyRow as any).title ?? '',
                  body_md: (legacyRow as any).body_md ?? '',
                  kanban_column_id: (legacyRow as any).kanban_column_id ?? null,
                }
                toolCalls.push({ name: 'fetch_ticket_content', input, output: out })
                return out
              }
            }
            // Supabase-only mode (0065): no fallback to docs/tickets
            out = { success: false, error: `Ticket ${normalizedId} not found in Supabase. Supabase-only mode requires Supabase connection.` }
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
          const ticketNumber = parseTicketNumber(input.ticket_id)
          const normalizedId = String(ticketNumber ?? 0).padStart(4, '0')
          const repoFullName =
            typeof config.projectId === 'string' && config.projectId.trim() ? config.projectId.trim() : ''
          type UpdateResult =
            | { success: true; ticketId: string; ready: boolean; missingItems?: string[] }
            | { success: false; error: string; detectedPlaceholders?: string[] }
          let out: UpdateResult
          try {
            // Validate for unresolved placeholders BEFORE any database operations (0066)
            let bodyMdTrimmed = input.body_md.trim()
            const placeholders = bodyMdTrimmed.match(PLACEHOLDER_RE) ?? []
            if (placeholders.length > 0) {
              const uniquePlaceholders = [...new Set(placeholders)]
              out = {
                success: false,
                error: `Ticket update rejected: unresolved template placeholder tokens detected. Detected placeholders: ${uniquePlaceholders.join(', ')}. Replace all angle-bracket placeholders with concrete content before updating the ticket.`,
                detectedPlaceholders: uniquePlaceholders,
              }
              toolCalls.push({ name: 'update_ticket_body', input, output: out })
              return out
            }
            // Normalize headings so stored ticket passes Ready-to-start (## and exact section titles)
            bodyMdTrimmed = normalizeBodyForReady(bodyMdTrimmed)

            if (!ticketNumber) {
              out = { success: false, error: `Could not parse ticket number from "${input.ticket_id}".` }
              toolCalls.push({ name: 'update_ticket_body', input, output: out })
              return out
            }

            let row: any = null
            let fetchError: any = null
            if (repoFullName) {
              const r = await supabase
                .from('tickets')
                .select('pk, id, display_id')
                .eq('repo_full_name', repoFullName)
                .eq('ticket_number', ticketNumber)
                .maybeSingle()
              row = r.data
              fetchError = r.error
              if (fetchError && isUnknownColumnError(fetchError)) {
                const legacy = await supabase.from('tickets').select('id').eq('id', normalizedId).maybeSingle()
                row = legacy.data
                fetchError = legacy.error
              }
            } else {
              const legacy = await supabase.from('tickets').select('id').eq('id', normalizedId).maybeSingle()
              row = legacy.data
              fetchError = legacy.error
            }

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
            // Normalize Title line in body_md to include ID prefix (0054)
            const displayId = row.display_id ?? normalizedId
            const normalizedBodyMd = normalizeTitleLineInBody(bodyMdTrimmed, displayId)
            // Re-validate after normalization (normalization shouldn't introduce placeholders, but check anyway)
            const normalizedPlaceholders = normalizedBodyMd.match(PLACEHOLDER_RE) ?? []
            if (normalizedPlaceholders.length > 0) {
              const uniquePlaceholders = [...new Set(normalizedPlaceholders)]
              out = {
                success: false,
                error: `Ticket update rejected: unresolved template placeholder tokens detected after normalization. Detected placeholders: ${uniquePlaceholders.join(', ')}. Replace all angle-bracket placeholders with concrete content before updating the ticket.`,
                detectedPlaceholders: uniquePlaceholders,
              }
              toolCalls.push({ name: 'update_ticket_body', input, output: out })
              return out
            }
            const updateQ = supabase.from('tickets').update({ body_md: normalizedBodyMd })
            const { error: updateError } = row.pk
              ? await updateQ.eq('pk', row.pk)
              : await updateQ.eq('id', normalizedId)
            if (updateError) {
              out = { success: false, error: `Supabase update: ${updateError.message}` }
            } else {
              const readiness = evaluateTicketReady(normalizedBodyMd)
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
          const ticketNumber = parseTicketNumber(input.ticket_id)
          const normalizedId = String(ticketNumber ?? 0).padStart(4, '0')
          const repoFullName =
            typeof config.projectId === 'string' && config.projectId.trim() ? config.projectId.trim() : ''
          type MoveResult =
            | { success: true; ticketId: string; fromColumn: string; toColumn: string }
            | { success: false; error: string }
          let out: MoveResult
          try {
            if (!ticketNumber) {
              out = { success: false, error: `Could not parse ticket number from "${input.ticket_id}".` }
              toolCalls.push({ name: 'kanban_move_ticket_to_todo', input, output: out })
              return out
            }

            let row: any = null
            let fetchError: any = null
            if (repoFullName) {
              const r = await supabase
                .from('tickets')
                .select('pk, id, kanban_column_id, kanban_position')
                .eq('repo_full_name', repoFullName)
                .eq('ticket_number', ticketNumber)
                .maybeSingle()
              row = r.data
              fetchError = r.error
              if (fetchError && isUnknownColumnError(fetchError)) {
                const legacy = await supabase
                  .from('tickets')
                  .select('id, kanban_column_id, kanban_position')
                  .eq('id', normalizedId)
                  .maybeSingle()
                row = legacy.data
                fetchError = legacy.error
              }
            } else {
              const legacy = await supabase
                .from('tickets')
                .select('id, kanban_column_id, kanban_position')
                .eq('id', normalizedId)
                .maybeSingle()
              row = legacy.data
              fetchError = legacy.error
            }

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
            let todoRows: any[] | null = null
            if (repoFullName) {
              const r = await supabase
                .from('tickets')
                .select('kanban_position')
                .eq('kanban_column_id', COL_TODO)
                .eq('repo_full_name', repoFullName)
                .order('kanban_position', { ascending: false })
                .limit(1)
              if (r.error && isUnknownColumnError(r.error)) {
                const legacy = await supabase
                  .from('tickets')
                  .select('kanban_position')
                  .eq('kanban_column_id', COL_TODO)
                  .order('kanban_position', { ascending: false })
                  .limit(1)
                if (legacy.error) {
                  out = { success: false, error: `Supabase fetch: ${legacy.error.message}` }
                  toolCalls.push({ name: 'kanban_move_ticket_to_todo', input, output: out })
                  return out
                }
                todoRows = legacy.data as any[] | null
              } else if (r.error) {
                out = { success: false, error: `Supabase fetch: ${r.error.message}` }
                toolCalls.push({ name: 'kanban_move_ticket_to_todo', input, output: out })
                return out
              } else {
                todoRows = r.data as any[] | null
              }
            } else {
              const legacy = await supabase
                .from('tickets')
                .select('kanban_position')
                .eq('kanban_column_id', COL_TODO)
                .order('kanban_position', { ascending: false })
                .limit(1)
              if (legacy.error) {
                out = { success: false, error: `Supabase fetch: ${legacy.error.message}` }
                toolCalls.push({ name: 'kanban_move_ticket_to_todo', input, output: out })
                return out
              }
              todoRows = legacy.data as any[] | null
            }

            const maxPos = (todoRows ?? []).reduce(
              (acc, r) => Math.max(acc, (r as { kanban_position?: number }).kanban_position ?? 0),
              0
            )
            const newPosition = maxPos + 1
            const now = new Date().toISOString()
            const updateQ = supabase
              .from('tickets')
              .update({
                kanban_column_id: COL_TODO,
                kanban_position: newPosition,
                kanban_moved_at: now,
              })
            const { error: updateError } = row.pk
              ? await updateQ.eq('pk', row.pk)
              : await updateQ.eq('id', normalizedId)
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

  const listTicketsByColumnTool =
    hasSupabase &&
    (() => {
      const supabase: SupabaseClient = createClient(
        config.supabaseUrl!.trim(),
        config.supabaseAnonKey!.trim()
      )
      return tool({
        description:
          'List all tickets in a given Kanban column (e.g. "col-qa", "col-todo", "col-unassigned", "col-human-in-the-loop"). Returns ticket ID, title, and column. Use when the user asks to see tickets in a specific column, especially QA.',
        parameters: z.object({
          column_id: z
            .string()
            .describe(
              'Kanban column ID (e.g. "col-qa", "col-todo", "col-unassigned", "col-human-in-the-loop")'
            ),
        }),
        execute: async (input: { column_id: string }) => {
          type ListResult =
            | {
                success: true
                column_id: string
                tickets: Array<{ id: string; title: string; column: string }>
                count: number
              }
            | { success: false; error: string }
          let out: ListResult
          try {
            const repoFullName =
              typeof config.projectId === 'string' && config.projectId.trim() ? config.projectId.trim() : ''

            const r = repoFullName
              ? await supabase
                  .from('tickets')
                  .select('id, display_id, ticket_number, title, kanban_column_id')
                  .eq('repo_full_name', repoFullName)
                  .eq('kanban_column_id', input.column_id)
                  .order('ticket_number', { ascending: true })
              : await supabase
                  .from('tickets')
                  .select('id, title, kanban_column_id')
                  .eq('kanban_column_id', input.column_id)
                  .order('id', { ascending: true })
            let rows = r.data as any[] | null
            let fetchError = r.error as any

            if (fetchError && isUnknownColumnError(fetchError) && repoFullName) {
              const legacy = await supabase
                .from('tickets')
                .select('id, title, kanban_column_id')
                .eq('kanban_column_id', input.column_id)
                .order('id', { ascending: true })
              rows = legacy.data as any[] | null
              fetchError = legacy.error as any
            }

            if (fetchError) {
              out = { success: false, error: `Supabase fetch: ${fetchError.message}` }
              toolCalls.push({ name: 'list_tickets_by_column', input, output: out })
              return out
            }

            const tickets = (rows ?? []).map((r) => ({
              id: (r as any).display_id ?? (r as { id: string }).id,
              title: (r as { title?: string }).title ?? '',
              column: input.column_id,
            }))

            out = {
              success: true,
              column_id: input.column_id,
              tickets,
              count: tickets.length,
            }
          } catch (err) {
            out = {
              success: false,
              error: err instanceof Error ? err.message : String(err),
            }
          }
          toolCalls.push({ name: 'list_tickets_by_column', input, output: out })
          return out
        },
      })
    })()

  const listAvailableReposTool =
    hasSupabase &&
    (() => {
      const supabase: SupabaseClient = createClient(
        config.supabaseUrl!.trim(),
        config.supabaseAnonKey!.trim()
      )
      return tool({
        description:
          'List all repositories (repo_full_name) that have tickets in the database. Use when the user asks "what repos can I move tickets to?" or similar questions about available target repositories.',
        parameters: z.object({}),
        execute: async () => {
          type ListReposResult =
            | {
                success: true
                repos: Array<{ repo_full_name: string }>
                count: number
              }
            | { success: false; error: string }
          let out: ListReposResult
          try {
            // Try to fetch distinct repo_full_name values
            const r = await supabase
              .from('tickets')
              .select('repo_full_name')
            let rows = r.data as any[] | null
            let fetchError = r.error as any

            if (fetchError && isUnknownColumnError(fetchError)) {
              // Legacy schema: no repo_full_name column
              out = {
                success: true,
                repos: [],
                count: 0,
              }
              toolCalls.push({ name: 'list_available_repos', input: {}, output: out })
              return out
            }

            if (fetchError) {
              out = { success: false, error: `Supabase fetch: ${fetchError.message}` }
              toolCalls.push({ name: 'list_available_repos', input: {}, output: out })
              return out
            }

            // Get unique repo_full_name values
            const repoSet = new Set<string>()
            for (const row of rows ?? []) {
              const repo = (row as any).repo_full_name
              if (repo && typeof repo === 'string' && repo.trim() !== '') {
                repoSet.add(repo.trim())
              }
            }

            const repos = Array.from(repoSet)
              .sort()
              .map((repo) => ({ repo_full_name: repo }))

            out = {
              success: true,
              repos,
              count: repos.length,
            }
          } catch (err) {
            out = {
              success: false,
              error: err instanceof Error ? err.message : String(err),
            }
          }
          toolCalls.push({ name: 'list_available_repos', input: {}, output: out })
          return out
        },
      })
    })()

  const kanbanMoveTicketToOtherRepoTodoTool =
    hasSupabase &&
    (() => {
      const supabase: SupabaseClient = createClient(
        config.supabaseUrl!.trim(),
        config.supabaseAnonKey!.trim()
      )
      const COL_TODO = 'col-todo'
      return tool({
        description:
          'Move a ticket to the To Do column of another repository. Works from any Kanban column (not only Unassigned). The ticket will be moved to the target repository and placed in its To Do column. Validates that both the ticket and target repository exist.',
        parameters: z.object({
          ticket_id: z.string().describe('Ticket id (e.g. "HAL-0012", "0012", or "12").'),
          target_repo_full_name: z
            .string()
            .describe('Target repository full name in format "owner/repo" (e.g. "owner/other-repo").'),
        }),
        execute: async (input: { ticket_id: string; target_repo_full_name: string }) => {
          const ticketNumber = parseTicketNumber(input.ticket_id)
          const normalizedId = String(ticketNumber ?? 0).padStart(4, '0')
          const targetRepo = input.target_repo_full_name.trim()
          const sourceRepoFullName =
            typeof config.projectId === 'string' && config.projectId.trim() ? config.projectId.trim() : ''
          type MoveResult =
            | {
                success: true
                ticketId: string
                display_id?: string
                fromRepo: string
                toRepo: string
                fromColumn: string
                toColumn: string
              }
            | { success: false; error: string }
          let out: MoveResult
          try {
            if (!ticketNumber) {
              out = { success: false, error: `Could not parse ticket number from "${input.ticket_id}".` }
              toolCalls.push({ name: 'kanban_move_ticket_to_other_repo_todo', input, output: out })
              return out
            }

            if (!targetRepo || !targetRepo.includes('/')) {
              out = {
                success: false,
                error: `Invalid target repository format. Expected "owner/repo", got "${targetRepo}".`,
              }
              toolCalls.push({ name: 'kanban_move_ticket_to_other_repo_todo', input, output: out })
              return out
            }

            // Fetch the ticket from the source repo
            let row: any = null
            let fetchError: any = null
            if (sourceRepoFullName) {
              const r = await supabase
                .from('tickets')
                .select('pk, id, display_id, ticket_number, repo_full_name, kanban_column_id, kanban_position, body_md')
                .eq('repo_full_name', sourceRepoFullName)
                .eq('ticket_number', ticketNumber)
                .maybeSingle()
              row = r.data
              fetchError = r.error
              if (fetchError && isUnknownColumnError(fetchError)) {
                const legacy = await supabase
                  .from('tickets')
                  .select('id, kanban_column_id, kanban_position, body_md')
                  .eq('id', normalizedId)
                  .maybeSingle()
                row = legacy.data
                fetchError = legacy.error
              }
            } else {
              // If no source repo is set, try to find the ticket by id globally
              const legacy = await supabase
                .from('tickets')
                .select('id, kanban_column_id, kanban_position, repo_full_name, body_md')
                .eq('id', normalizedId)
                .maybeSingle()
                row = legacy.data
                fetchError = legacy.error
            }

            if (fetchError) {
              out = { success: false, error: `Supabase fetch: ${fetchError.message}` }
              toolCalls.push({ name: 'kanban_move_ticket_to_other_repo_todo', input, output: out })
              return out
            }
            if (!row) {
              out = { success: false, error: `Ticket ${input.ticket_id} not found.` }
              toolCalls.push({ name: 'kanban_move_ticket_to_other_repo_todo', input, output: out })
              return out
            }

            const currentCol = (row as { kanban_column_id?: string | null }).kanban_column_id ?? 'col-unassigned'
            const currentRepo = (row as { repo_full_name?: string | null }).repo_full_name ?? 'legacy/unknown'

            // Validate target repo exists by checking if there are any tickets in that repo
            const targetRepoCheck = await supabase
              .from('tickets')
              .select('repo_full_name')
              .eq('repo_full_name', targetRepo)
              .limit(1)
            let targetRepoExists = false
            if (targetRepoCheck.error && isUnknownColumnError(targetRepoCheck.error)) {
              // Legacy schema: can't check repo, but we'll proceed
              targetRepoExists = true
            } else if (targetRepoCheck.error) {
              out = {
                success: false,
                error: `Failed to validate target repository: ${targetRepoCheck.error.message}`,
              }
              toolCalls.push({ name: 'kanban_move_ticket_to_other_repo_todo', input, output: out })
              return out
            } else {
              // Target repo exists if we can query it (even if no tickets yet)
              // We'll allow moving to a repo even if it has no tickets yet
              targetRepoExists = true
            }

            // If target repo doesn't exist (in new schema), return error
            if (!targetRepoExists) {
              out = {
                success: false,
                error: `Target repository "${targetRepo}" does not exist or you do not have access to it. Use list_available_repos to see available repositories.`,
              }
              toolCalls.push({ name: 'kanban_move_ticket_to_other_repo_todo', input, output: out })
              return out
            }

            // Calculate next ticket_number for target repo
            let nextTicketNumber = ticketNumber
            const maxTicketQuery = await supabase
              .from('tickets')
              .select('ticket_number')
              .eq('repo_full_name', targetRepo)
              .order('ticket_number', { ascending: false })
              .limit(1)
            if (!maxTicketQuery.error && maxTicketQuery.data && maxTicketQuery.data.length > 0) {
              const maxN = (maxTicketQuery.data[0] as { ticket_number?: number }).ticket_number
              if (typeof maxN === 'number' && Number.isFinite(maxN)) {
                nextTicketNumber = maxN + 1
              }
            } else if (maxTicketQuery.error && !isUnknownColumnError(maxTicketQuery.error)) {
              // If error is not about missing column, it's a real error
              out = {
                success: false,
                error: `Failed to calculate next ticket number: ${maxTicketQuery.error.message}`,
              }
              toolCalls.push({ name: 'kanban_move_ticket_to_other_repo_todo', input, output: out })
              return out
            }

            // Calculate next position in target repo's To Do column
            let nextTodoPosition = 0
            const todoQ = supabase
              .from('tickets')
              .select('kanban_position')
              .eq('kanban_column_id', COL_TODO)
              .eq('repo_full_name', targetRepo)
              .order('kanban_position', { ascending: false })
              .limit(1)
            const todoR = await todoQ
            if (todoR.error && isUnknownColumnError(todoR.error)) {
              // Legacy schema: ignore repo filter
              const legacyTodo = await supabase
                .from('tickets')
                .select('kanban_position')
                .eq('kanban_column_id', COL_TODO)
                .order('kanban_position', { ascending: false })
                .limit(1)
              if (legacyTodo.error) {
                out = { success: false, error: `Supabase fetch: ${legacyTodo.error.message}` }
                toolCalls.push({ name: 'kanban_move_ticket_to_other_repo_todo', input, output: out })
                return out
              }
              const max = (legacyTodo.data ?? []).reduce(
                (acc, r) => Math.max(acc, (r as { kanban_position?: number }).kanban_position ?? 0),
                0
              )
              nextTodoPosition = max + 1
            } else if (todoR.error) {
              out = { success: false, error: `Supabase fetch: ${todoR.error.message}` }
              toolCalls.push({ name: 'kanban_move_ticket_to_other_repo_todo', input, output: out })
              return out
            } else {
              const max = (todoR.data ?? []).reduce(
                (acc, r) => Math.max(acc, (r as { kanban_position?: number }).kanban_position ?? 0),
                0
              )
              nextTodoPosition = max + 1
            }

            // Generate new display_id with target repo prefix
            const targetPrefix = repoHintPrefix(targetRepo)
            const newDisplayId = `${targetPrefix}-${String(nextTicketNumber).padStart(4, '0')}`

            // Update ticket: change repo, ticket_number, display_id, column, and position
            const now = new Date().toISOString()
            const updateData: any = {
              repo_full_name: targetRepo,
              ticket_number: nextTicketNumber,
              display_id: newDisplayId,
              kanban_column_id: COL_TODO,
              kanban_position: nextTodoPosition,
              kanban_moved_at: now,
            }

            // Also update the Title line in body_md to reflect new display_id
            const currentBodyMd = (row as { body_md?: string }).body_md
            if (currentBodyMd) {
              updateData.body_md = normalizeTitleLineInBody(currentBodyMd, newDisplayId)
            }

            const updateQ = supabase.from('tickets').update(updateData)
            const { error: updateError } = row.pk
              ? await updateQ.eq('pk', row.pk)
              : await updateQ.eq('id', normalizedId)

            if (updateError) {
              out = { success: false, error: `Supabase update: ${updateError.message}` }
            } else {
              out = {
                success: true,
                ticketId: normalizedId,
                display_id: newDisplayId,
                fromRepo: currentRepo,
                toRepo: targetRepo,
                fromColumn: currentCol,
                toColumn: COL_TODO,
              }
            }
          } catch (err) {
            out = {
              success: false,
              error: err instanceof Error ? err.message : String(err),
            }
          }
          toolCalls.push({ name: 'kanban_move_ticket_to_other_repo_todo', input, output: out })
          return out
        },
      })
    })()

  // Helper: use GitHub API when githubReadFile is provided (Connect GitHub Repo); otherwise use HAL repo (direct FS)
  const hasGitHubRepo =
    typeof config.repoFullName === 'string' &&
    config.repoFullName.trim() !== '' &&
    typeof config.githubReadFile === 'function'
  
  // Track which repo is being used for debugging (0119)
  const repoUsage: Array<{ tool: string; usedGitHub: boolean; path?: string }> = []
  
  // Debug logging (0119: verify PM agent receives correct config)
  if (typeof console !== 'undefined' && console.warn) {
    console.warn(`[PM Agent] hasGitHubRepo=${hasGitHubRepo}, repoFullName=${config.repoFullName || 'NOT SET'}, hasGithubReadFile=${typeof config.githubReadFile === 'function'}, hasGithubSearchCode=${typeof config.githubSearchCode === 'function'}`)
  }

  const readFileTool = tool({
    description: hasGitHubRepo
      ? 'Read file contents from the connected GitHub repo. Path is relative to repo root. Max 500 lines. Uses committed code on default branch.'
      : 'Read file contents from HAL repo. Path is relative to repo root. Max 500 lines.',
    parameters: z.object({
      path: z.string().describe('File path (relative to repo/project root)'),
    }),
    execute: async (input) => {
      let out: { content: string } | { error: string }
      const usedGitHub = !!(hasGitHubRepo && config.githubReadFile)
      repoUsage.push({ tool: 'read_file', usedGitHub, path: input.path })
      if (hasGitHubRepo && config.githubReadFile) {
        // Debug: log when using GitHub API (0119)
        if (typeof console !== 'undefined' && console.log) {
          console.log(`[PM Agent] Using GitHub API to read: ${config.repoFullName}/${input.path}`)
        }
        out = await config.githubReadFile(input.path, 500)
      } else {
        // Debug: log when falling back to HAL repo (0119)
        if (typeof console !== 'undefined' && console.warn) {
          console.warn(`[PM Agent] Falling back to HAL repo for: ${input.path} (hasGitHubRepo=${hasGitHubRepo}, hasGithubReadFile=${typeof config.githubReadFile === 'function'})`)
        }
        out = await readFile(ctx, input)
      }
      toolCalls.push({ name: 'read_file', input, output: out })
      return typeof (out as { error?: string }).error === 'string'
        ? JSON.stringify(out)
        : out
    },
  })

  const searchFilesTool = tool({
    description: hasGitHubRepo
      ? 'Search code in the connected GitHub repo. Pattern is used as search term (GitHub does not support full regex).'
      : 'Regex search across files in HAL repo. Pattern is JavaScript regex.',
    parameters: z.object({
      pattern: z.string().describe('Regex pattern to search for'),
      glob: z.string().describe('Glob pattern to filter files (e.g. "**/*" for all, "**/*.ts" for TypeScript)'),
    }),
    execute: async (input) => {
      let out: { matches: Array<{ path: string; line: number; text: string }> } | { error: string }
      const usedGitHub = !!(hasGitHubRepo && config.githubSearchCode)
      repoUsage.push({ tool: 'search_files', usedGitHub, path: input.pattern })
      if (hasGitHubRepo && config.githubSearchCode) {
        // Debug: log when using GitHub API (0119)
        if (typeof console !== 'undefined' && console.log) {
          console.log(`[PM Agent] Using GitHub API to search: ${config.repoFullName} pattern: ${input.pattern}`)
        }
        out = await config.githubSearchCode(input.pattern, input.glob)
      } else {
        // Debug: log when falling back to HAL repo (0119)
        if (typeof console !== 'undefined' && console.warn) {
          console.warn(`[PM Agent] Falling back to HAL repo for search: ${input.pattern} (hasGitHubRepo=${hasGitHubRepo}, hasGithubSearchCode=${typeof config.githubSearchCode === 'function'})`)
        }
        out = await searchFiles(ctx, { pattern: input.pattern, glob: input.glob })
      }
      toolCalls.push({ name: 'search_files', input, output: out })
      return typeof (out as { error?: string }).error === 'string'
        ? JSON.stringify(out)
        : out
    },
  })

  const tools = {
    list_directory: tool({
      description: hasGitHubRepo
        ? 'List files in a directory in the connected GitHub repo. Path is relative to repo root.'
        : 'List files in a directory in HAL repo. Path is relative to repo root.',
      parameters: z.object({
        path: z.string().describe('Directory path (relative to repo/project root)'),
      }),
      execute: async (input) => {
        let out: { entries: string[] } | { error: string }
        const usedGitHub = !!(hasGitHubRepo && config.githubListDirectory)
        repoUsage.push({ tool: 'list_directory', usedGitHub, path: input.path })
        if (hasGitHubRepo && config.githubListDirectory) {
          // Debug: log when using GitHub API (0119)
          if (typeof console !== 'undefined' && console.log) {
            console.log(`[PM Agent] Using GitHub API to list directory: ${config.repoFullName}/${input.path}`)
          }
          out = await config.githubListDirectory(input.path)
        } else {
          // Debug: log when falling back to HAL repo (0119)
          if (typeof console !== 'undefined' && console.warn) {
            console.warn(`[PM Agent] Falling back to HAL repo for list_directory: ${input.path} (hasGitHubRepo=${hasGitHubRepo}, hasGithubListDirectory=${typeof config.githubListDirectory === 'function'})`)
          }
          out = await listDirectory(ctx, input)
        }
        toolCalls.push({ name: 'list_directory', input, output: out })
        return typeof (out as { error?: string }).error === 'string'
          ? JSON.stringify(out)
          : out
      },
    }),
    read_file: readFileTool,
    search_files: searchFilesTool,
    ...(createTicketTool ? { create_ticket: createTicketTool } : {}),
    ...(fetchTicketContentTool ? { fetch_ticket_content: fetchTicketContentTool } : {}),
    evaluate_ticket_ready: evaluateTicketReadyTool,
    ...(updateTicketBodyTool ? { update_ticket_body: updateTicketBodyTool } : {}),
    ...(syncTicketsTool ? { sync_tickets: syncTicketsTool } : {}),
    ...(kanbanMoveTicketToTodoTool ? { kanban_move_ticket_to_todo: kanbanMoveTicketToTodoTool } : {}),
    ...(listTicketsByColumnTool ? { list_tickets_by_column: listTicketsByColumnTool } : {}),
    ...(listAvailableReposTool ? { list_available_repos: listAvailableReposTool } : {}),
    ...(kanbanMoveTicketToOtherRepoTodoTool
      ? { kanban_move_ticket_to_other_repo_todo: kanbanMoveTicketToOtherRepoTodoTool }
      : {}),
  }

  const promptBase = `${contextPack}\n\n---\n\nRespond to the user message above using the tools as needed.`

  // Build prompt with images if present
  // For vision models, prompt must be an array of content parts
  // For non-vision models, prompt is a string (images are ignored)
  const hasImages = config.images && config.images.length > 0
  const isVisionModel = config.openaiModel.includes('vision') || config.openaiModel.includes('gpt-4o')
  
  let prompt: string | Array<{ type: 'text' | 'image'; text?: string; image?: string }>
  if (hasImages && isVisionModel) {
    // Vision model: use array format with text and images
    prompt = [
      { type: 'text' as const, text: promptBase },
      ...config.images!.map((img) => ({ type: 'image' as const, image: img.dataUrl })),
    ]
  } else {
    // Non-vision model or no images: use string format
    prompt = promptBase
    if (hasImages && !isVisionModel) {
      // Log warning but don't fail - user can still send text
      console.warn('[PM Agent] Images provided but model does not support vision. Images will be ignored.')
    }
  }

  const providerOptions =
    config.previousResponseId != null && config.previousResponseId !== ''
      ? { openai: { previousResponseId: config.previousResponseId } }
      : undefined

  try {
    const result = await generateText({
      model,
      system: PM_SYSTEM_INSTRUCTIONS,
      prompt: prompt as any, // Type assertion: AI SDK supports array format for vision models
      tools,
      maxSteps: MAX_TOOL_ITERATIONS,
      ...(providerOptions && { providerOptions }),
    })

    let reply = result.text ?? ''
    // If the model returned no text but create_ticket succeeded, provide a fallback so the user sees a clear outcome (0011/0020)
    // Also handle placeholder validation failures (0066)
    if (!reply.trim()) {
      // Check for placeholder validation failures first (0066)
      const createTicketRejected = toolCalls.find(
        (c) =>
          c.name === 'create_ticket' &&
          typeof c.output === 'object' &&
          c.output !== null &&
          (c.output as { success?: boolean }).success === false &&
          (c.output as { detectedPlaceholders?: string[] }).detectedPlaceholders
      )
      if (createTicketRejected) {
        const out = createTicketRejected.output as {
          error: string
          detectedPlaceholders?: string[]
        }
        reply = `**Ticket creation rejected:** ${out.error}`
        if (out.detectedPlaceholders && out.detectedPlaceholders.length > 0) {
          reply += `\n\n**Detected placeholders:** ${out.detectedPlaceholders.join(', ')}`
        }
        reply += `\n\nPlease replace all angle-bracket placeholders with concrete content and try again. Check Diagnostics for details.`
      } else {
        const updateTicketRejected = toolCalls.find(
          (c) =>
            c.name === 'update_ticket_body' &&
            typeof c.output === 'object' &&
            c.output !== null &&
            (c.output as { success?: boolean }).success === false &&
            (c.output as { detectedPlaceholders?: string[] }).detectedPlaceholders
        )
        if (updateTicketRejected) {
          const out = updateTicketRejected.output as {
            error: string
            detectedPlaceholders?: string[]
          }
          reply = `**Ticket update rejected:** ${out.error}`
          if (out.detectedPlaceholders && out.detectedPlaceholders.length > 0) {
            reply += `\n\n**Detected placeholders:** ${out.detectedPlaceholders.join(', ')}`
          }
          reply += `\n\nPlease replace all angle-bracket placeholders with concrete content and try again. Check Diagnostics for details.`
        } else {
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
                } else {
                  const listTicketsCall = toolCalls.find(
                    (c) =>
                      c.name === 'list_tickets_by_column' &&
                      typeof c.output === 'object' &&
                      c.output !== null &&
                      (c.output as { success?: boolean }).success === true
                  )
                  if (listTicketsCall) {
                    const out = listTicketsCall.output as {
                      column_id: string
                      tickets: Array<{ id: string; title: string; column: string }>
                      count: number
                    }
                    if (out.count === 0) {
                      reply = `No tickets found in column **${out.column_id}**.`
                    } else {
                      const ticketList = out.tickets
                        .map((t) => `- **${t.id}** — ${t.title}`)
                        .join('\n')
                      reply = `Tickets in **${out.column_id}** (${out.count}):\n\n${ticketList}`
                    }
                  } else {
                    const listReposCall = toolCalls.find(
                      (c) =>
                        c.name === 'list_available_repos' &&
                        typeof c.output === 'object' &&
                        c.output !== null &&
                        (c.output as { success?: boolean }).success === true
                    )
                    if (listReposCall) {
                      const out = listReposCall.output as {
                        repos: Array<{ repo_full_name: string }>
                        count: number
                      }
                      if (out.count === 0) {
                        reply = `No repositories found in the database.`
                      } else {
                        const repoList = out.repos.map((r) => `- **${r.repo_full_name}**`).join('\n')
                        reply = `Available repositories (${out.count}):\n\n${repoList}`
                      }
                    } else {
                      const moveToOtherRepoCall = toolCalls.find(
                        (c) =>
                          c.name === 'kanban_move_ticket_to_other_repo_todo' &&
                          typeof c.output === 'object' &&
                          c.output !== null &&
                          (c.output as { success?: boolean }).success === true
                      )
                      if (moveToOtherRepoCall) {
                        const out = moveToOtherRepoCall.output as {
                          ticketId: string
                          display_id?: string
                          fromRepo: string
                          toRepo: string
                          fromColumn: string
                          toColumn: string
                        }
                        reply = `I moved ticket **${out.display_id ?? out.ticketId}** from **${out.fromRepo}** (${out.fromColumn}) to **${out.toRepo}** (${out.toColumn}). The ticket is now in the To Do column of the target repository.`
                      }
                    }
                  }
                }
              }
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
      // Include repo usage for debugging (0119)
      _repoUsage: repoUsage.length > 0 ? repoUsage : undefined,
    }
  } catch (err) {
    return {
      reply: '',
      toolCalls,
      outboundRequest: capturedRequest ? (redact(capturedRequest) as object) : {},
      error: err instanceof Error ? err.message : String(err),
      errorPhase: 'openai',
      // Include repo usage even on error (0119)
      _repoUsage: repoUsage.length > 0 ? repoUsage : undefined,
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
