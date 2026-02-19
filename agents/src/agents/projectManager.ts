/**
 * Project Manager agent — context pack, read-only tools, OpenAI Responses API.
 * Module: portfolio-2026-hal-agents (no server required).
 * 
 * This file re-exports all PM agent functionality from modular sub-files.
 */

import { createOpenAI } from '@ai-sdk/openai'
import { generateText, tool } from 'ai'
import { z } from 'zod'
import path from 'path'
import fs from 'fs/promises'
import { redact } from '../utils/redact.js'
import {
  normalizeBodyForReady,
  normalizeTitleLineInBody,
} from '../lib/ticketBodyNormalization.js'
import {
  slugFromTitle,
  parseTicketNumber,
  evaluateTicketReady,
  PLACEHOLDER_RE,
  type ReadyCheckResult,
} from '../lib/projectManagerHelpers.js'
import {
  listDirectory,
  readFile,
  searchFiles,
  type ToolContext,
} from './tools.js'
import { type CheckUnassignedResult } from './projectManager/ticketOperations.js'
import {
  respond,
  type RespondContext,
  type RespondInput,
  type RespondMeta,
  type RespondOutput,
} from './projectManager/responseHandling.js'
import {
  buildContextPack,
  type ConversationTurn,
  type PmAgentConfig,
} from './projectManager/contextBuilding.js'
import {
  summarizeForContext,
  generateWorkingMemory,
  type WorkingMemory,
} from './projectManager/summarization.js'

// Re-export for backward compatibility
export type { ReadyCheckResult }
export { evaluateTicketReady }

// Re-export from modules
export type { CheckUnassignedResult }
// checkUnassignedTickets is intentionally not re-exported; unassigned checks are server-side only.
export type { RespondContext, RespondInput, RespondMeta, RespondOutput }
export { respond }
export type { ConversationTurn, PmAgentConfig }
export type { WorkingMemory }
export { summarizeForContext, generateWorkingMemory }

// --- runPmAgent (0003) ---

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
  /** Full prompt text sent to the LLM (system instructions + context pack + user message) */
  promptText?: string
}

const PM_SYSTEM_INSTRUCTIONS = `You are the Project Manager agent for HAL. Your job is to help users understand the codebase, review tickets, and provide project guidance.

**Instruction loading:** Start with the global bootstrap instructions (shared by all agent types). Before executing agent-specific workflows, request your full agent instruction set with \`get_instruction_set({ agentType: "<your-agent-type>" })\`. After that, request specific topic details only when needed using \`get_instruction_set({ topicId: "<topic-id>" })\`.

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

**Working Memory:** When "Working Memory" is present, it contains structured context from the conversation history (goals, requirements, constraints, decisions, assumptions, open questions, glossary, stakeholders). Use this information to maintain continuity across long conversations. When generating tickets or making recommendations, incorporate relevant information from working memory even if it's not in the recent message window. If working memory indicates constraints or decisions were made earlier, respect them in your responses.

**Creating tickets:** When the user **explicitly** asks to create a ticket (e.g. "create a ticket", "create ticket for that", "create a new ticket for X"), you MUST call the create_ticket tool if it is available. Do NOT call create_ticket for short, non-actionable messages such as: "test", "ok", "hi", "hello", "thanks", "cool", "checking", "asdf", or similar—these are usually the user testing the UI, acknowledging, or typing casually. Do not infer a ticket-creation request from context alone. Calling the tool is what actually creates the ticket—do not only write the ticket content in your message. Use create_ticket with a short title (without the ID prefix—the tool assigns the next repo-scoped ID and normalizes the Title line to "PREFIX-NNNN — ..."). Provide a full markdown body following the repo ticket template. Do not invent an ID—the tool assigns it. Do not write secrets or API keys into the ticket body. If ticket creation fails due to server configuration, tell the user to configure HAL server-side Supabase credentials and retry.

**Server-side ticket operations (no direct Supabase):** For creating, updating, or moving tickets, you MUST use the HAL API endpoints exposed by your tools (the server uses privileged Supabase credentials). Do NOT attempt direct Supabase writes from the PM agent and do NOT require SUPABASE_* environment variables in the PM agent process.

**Moving a ticket to To Do:** When the user asks to move a ticket to To Do (e.g. "move this to To Do", "move ticket 0012 to To Do"), you MUST (1) fetch the ticket content with fetch_ticket_content (by ticket id), (2) evaluate readiness with evaluate_ticket_ready (pass the body_md from the fetch result). If the ticket is NOT ready, do NOT call kanban_move_ticket_to_todo; instead reply with a clear list of what is missing (use the missingItems from the evaluate_ticket_ready result). (3) If the ticket IS ready, call kanban_move_ticket_to_todo with the ticket id. If the move fails with "RED document is required", create a RED document using create_red_document, then retry the move. Then confirm in chat that the ticket was moved. The readiness checklist is in your instructions (topic: ready-to-start-checklist): Goal, Human-verifiable deliverable, Acceptance criteria checkboxes, Constraints, Non-goals, no unresolved placeholders, RED document.

**Preparing a ticket (Definition of Ready):** When the user asks to "prepare ticket X" or "get ticket X ready" (e.g. from "Prepare top ticket" button), you MUST (1) fetch the ticket content with fetch_ticket_content, (2) evaluate readiness with evaluate_ticket_ready. If the ticket is NOT ready, use update_ticket_body to fix formatting issues (normalize headings, convert bullets to checkboxes in Acceptance criteria if needed, ensure all required sections exist). After updating, re-evaluate with evaluate_ticket_ready. (3) Check if a RED document exists for the ticket (if moving to To Do fails with "RED document is required", create one using create_red_document). (4) If the ticket IS ready (after fixes if needed) and has a RED document, automatically call kanban_move_ticket_to_todo to move it to To Do. Then confirm in chat that the ticket is Ready-to-start and has been moved to To Do. If the ticket cannot be made ready (e.g. missing required content that cannot be auto-generated), clearly explain what is missing and that the ticket remains in Unassigned.

**Listing tickets by column:** When the user asks to see tickets in a specific Kanban column (e.g. "list tickets in QA column", "what tickets are in QA", "show me tickets in the QA column"), use list_tickets_by_column with the appropriate column_id (e.g. "col-qa" for QA, "col-todo" for To Do, "col-unassigned" for Unassigned, "col-human-in-the-loop" for Human in the Loop). Format the results clearly in your reply, showing ticket ID and title for each ticket. This helps you see which tickets are currently in a given column so you can update other tickets without asking the user for IDs.

**Moving tickets to named columns:** When the user asks to move a ticket to a column by name (e.g. "move HAL-0121 to Ready to Do", "put ticket 0121 in QA", "move this to Human in the Loop"), use move_ticket_to_column with the ticket_id and column_name. You can also specify position: "top" (move to top of column), "bottom" (move to bottom, default), or a number (0-based index, e.g. 0 for first position, 1 for second). The tool automatically resolves column names to column IDs. After moving, confirm the ticket appears in the specified column and position in the Kanban UI.

**Bulk operations (move all / move multiple):** When the user asks to move ALL tickets from one column to another (e.g. "move all tickets from Unassigned to Will Not Implement", "move everything in Unassigned to To Do"), you MUST process in batches to avoid timeouts. (1) Call list_tickets_by_column with the source column (e.g. col-unassigned) to get the tickets. (2) Process at most 5 tickets per request: call move_ticket_to_column for each of the first 5 tickets, then stop. (3) In your reply, state how many you moved and how many remain. If any remain, end with: "Reply with **Continue** to move the next batch." The user can then say "Continue" (or "continue") and you will list the source column again (which now has fewer tickets), move the next batch of up to 5, and repeat until all are moved. Do NOT attempt to move more than 5 tickets in a single request—this causes timeouts.

**Continue (batch operations):** When the user says "Continue", "continue", or similar, check the conversation: if your previous reply ended with "Reply with **Continue** to move the next batch", then list the source column again, move up to 5 more tickets, and report progress. If more remain, again end with "Reply with **Continue** to move the next batch." If none remain, confirm that all tickets have been moved.

**Moving tickets to other repositories:** When the user asks to move a ticket to another repository's To Do column (e.g. "Move ticket HAL-0012 to owner/other-repo To Do"), use kanban_move_ticket_to_other_repo_todo with the ticket_id and target_repo_full_name. This tool works from any Kanban column (not only Unassigned). The ticket will be moved to the target repository and placed in its To Do column, and the ticket's display_id will be updated to match the target repo's prefix. If the target repo does not exist or the user lacks access, the tool will return a clear error message. If the ticket ID is invalid or not found, the tool will return a clear error message. After a successful move, confirm in chat the target repository and that the ticket is now in To Do.

**Listing available repositories:** When the user asks "what repos can I move tickets to?" or similar questions about available target repositories, use list_available_repos to get a list of all repositories (repo_full_name) that have tickets in the database. Format the results clearly in your reply, showing the repository names.

**Supabase is the source of truth for ticket content.** When the user asks to edit or fix a ticket, you must update the ticket in the database (do not suggest editing docs/tickets/*.md only). Use update_ticket_body (which calls HAL API) to write the corrected body_md to Supabase. The Kanban UI reflects it within ~10 seconds.

**Editing ticket body in Supabase:** When a ticket in Unassigned fails the Definition of Ready (missing sections, placeholders, etc.) and the user asks to fix it or make it ready, use update_ticket_body to write the corrected body_md (via HAL API). Provide the full markdown body with all required sections: Goal (one sentence), Human-verifiable deliverable (UI-only), Acceptance criteria (UI-only) with - [ ] checkboxes, Constraints, Non-goals. Replace every placeholder with concrete content.

**Attaching images to tickets:** When a user uploads an image in chat and asks to attach it to a ticket (e.g. "Add this image to ticket HAL-0143"), use attach_image_to_ticket with the ticket ID. Images are available from recent conversation messages (persisted to database) as well as the current request. The tool automatically accesses images from recent messages and the current conversation turn. If multiple images are available, you can specify image_index (0-based) to select which image to attach. The image will appear in the ticket's Artifacts section. The tool prevents duplicate attachments of the same image.

Always cite file paths when referencing specific content.`

const MAX_TOOL_ITERATIONS = 10
// Constants for column IDs (used in tools)
export const COL_UNASSIGNED = 'col-unassigned'
export const COL_TODO = 'col-todo'

// buildContextPack is now imported from './projectManager/contextBuilding.js'

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

  const halBaseUrl = (process.env.HAL_API_BASE_URL || 'https://portfolio-2026-hal.vercel.app').trim()

  const createTicketTool = tool({
    description:
      'Create a new ticket via the HAL API (server-side Supabase secret key). The ticket is created in Unassigned; if it already passes the Ready-to-start checklist, HAL may auto-move it to To Do.',
    parameters: z.object({
      title: z.string().describe('Short title for the ticket (no ID prefix).'),
      body_md: z.string().describe('Full markdown body for the ticket. No unresolved placeholders.'),
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
            ready: boolean
            missingItems?: string[]
            movedToTodo?: boolean
            moveError?: string
          }
        | { success: false; error: string; detectedPlaceholders?: string[] }

      let out: CreateResult
      try {
        let bodyMdTrimmed = input.body_md.trim()
        const placeholders = bodyMdTrimmed.match(PLACEHOLDER_RE) ?? []
        if (placeholders.length > 0) {
          const uniquePlaceholders = [...new Set(placeholders)]
          out = {
            success: false,
            error: `Ticket creation rejected: unresolved template placeholder tokens detected. Detected placeholders: ${uniquePlaceholders.join(', ')}.`,
            detectedPlaceholders: uniquePlaceholders,
          }
          toolCalls.push({ name: 'create_ticket', input, output: out })
          return out
        }

        bodyMdTrimmed = normalizeBodyForReady(bodyMdTrimmed)

        const repoFullName =
          typeof config.projectId === 'string' && config.projectId.trim()
            ? config.projectId.trim()
            : 'beardedphil/portfolio-2026-hal'

        const createRes = await fetch(`${halBaseUrl}/api/tickets/create-general`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: input.title.trim(),
            body_md: bodyMdTrimmed,
            repo_full_name: repoFullName,
            kanban_column_id: COL_UNASSIGNED,
          }),
        })
        const created = (await createRes.json()) as any
        if (!created?.success || !created?.ticketId) {
          out = { success: false, error: created?.error || 'Failed to create ticket' }
          toolCalls.push({ name: 'create_ticket', input, output: out })
          return out
        }

        const displayId = String(created.ticketId)
        const ticketPk = typeof created.pk === 'string' ? created.pk : undefined
        const ticketNumber = parseTicketNumber(displayId)
        const id = String(ticketNumber ?? 0).padStart(4, '0')
        const filename = `${id}-${slugFromTitle(input.title)}.md`
        const filePath = `supabase:tickets/${displayId}`

        const normalizedBodyMd = normalizeTitleLineInBody(bodyMdTrimmed, displayId)
        // Persist normalized Title line (and strip QA blocks server-side).
        try {
          await fetch(`${halBaseUrl}/api/tickets/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...(ticketPk ? { ticketPk } : { ticketId: displayId }),
              body_md: normalizedBodyMd,
            }),
          })
        } catch {
          // Non-fatal: ticket is still created.
        }

        const readiness = evaluateTicketReady(normalizedBodyMd)

        let movedToTodo = false
        let moveError: string | undefined
        if (readiness.ready) {
          const moveRes = await fetch(`${halBaseUrl}/api/tickets/move`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticketId: displayId, columnId: COL_TODO, position: 'bottom' }),
          })
          const moved = (await moveRes.json()) as any
          if (moved?.success) movedToTodo = true
          else moveError = moved?.error || 'Failed to move to To Do'
        }

        out = {
          success: true,
          id,
          display_id: displayId,
          ...(typeof ticketNumber === 'number' ? { ticket_number: ticketNumber } : {}),
          repo_full_name: repoFullName,
          filename,
          filePath,
          ready: readiness.ready,
          ...(readiness.missingItems.length > 0 ? { missingItems: readiness.missingItems } : {}),
          ...(movedToTodo ? { movedToTodo: true } : {}),
          ...(moveError ? { moveError } : {}),
        }
      } catch (err) {
        out = { success: false, error: err instanceof Error ? err.message : String(err) }
      }

      toolCalls.push({ name: 'create_ticket', input, output: out })
      return out
    },
  })

  const fetchTicketContentTool = tool({
    description:
      'Fetch the full ticket content (body_md, title, id/display_id, kanban_column_id) and artifacts via the HAL API (server-side Supabase secret key).',
    parameters: z.object({
      ticket_id: z.string().describe('Ticket reference (e.g. "HAL-0012", "0012", or "12").'),
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
            artifacts: Array<{
              artifact_id: string
              ticket_pk: string
              repo_full_name?: string | null
              agent_type: string
              title: string
              body_md: string | null
              created_at: string
              updated_at?: string | null
            }>
            artifacts_error?: string
            ticket?: Record<string, any>
          }
        | { success: false; error: string }

      let out: FetchResult
      try {
        const res = await fetch(`${halBaseUrl}/api/tickets/get`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticketId: input.ticket_id }),
        })
        const data = (await res.json()) as any
        if (!data?.success || !data?.ticket) {
          out = { success: false, error: data?.error || `Ticket ${input.ticket_id} not found.` }
          toolCalls.push({ name: 'fetch_ticket_content', input, output: out })
          return out
        }

        const ticket = data.ticket as any
        out = {
          success: true,
          id: ticket.id ?? normalizedId,
          display_id: ticket.display_id ?? undefined,
          ticket_number: ticket.ticket_number ?? undefined,
          repo_full_name: ticket.repo_full_name ?? undefined,
          title: ticket.title ?? '',
          body_md: data.body_md ?? ticket.body_md ?? '',
          kanban_column_id: ticket.kanban_column_id ?? null,
          artifacts: Array.isArray(data.artifacts) ? data.artifacts : [],
          ...(data.artifacts_error ? { artifacts_error: String(data.artifacts_error) } : {}),
          ticket,
        }
      } catch (err) {
        out = { success: false, error: err instanceof Error ? err.message : String(err) }
      }

      toolCalls.push({ name: 'fetch_ticket_content', input, output: out })
      return out
    },
  })

  const attachImageToTicketTool = tool({
    description:
      'Attach an uploaded image to a ticket. This PM agent must call HAL endpoints and must not write to Supabase directly; image-attachment via API is not yet implemented.',
    parameters: z.object({
      ticket_id: z.string().describe('Ticket ID (e.g. "HAL-0143", "0143", or "143").'),
      image_index: z
        .number()
        .int()
        .min(0)
        .describe('Zero-based index of the image to attach (0 is first).'),
    }),
    execute: async (input: { ticket_id: string; image_index?: number }) => {
      const out = {
        success: false as const,
        error:
          'attach_image_to_ticket is temporarily unavailable: PM agent is endpoint-only and there is not yet a HAL API endpoint for image attachments. Use the UI workflow to attach the image, or add a dedicated endpoint.',
      }
      toolCalls.push({ name: 'attach_image_to_ticket', input, output: out })
      return out
    },
  })

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

  const updateTicketBodyTool = tool({
    description:
      "Update a ticket's body_md via the HAL API (server-side Supabase secret key). Use when the user asks to edit/fix a ticket or make it Ready-to-start.",
    parameters: z.object({
      ticket_id: z.string().describe('Ticket id (e.g. "HAL-0037", "0037", or "37").'),
      body_md: z.string().describe('Full markdown body. No placeholders.'),
    }),
    execute: async (input: { ticket_id: string; body_md: string }) => {
      type UpdateResult =
        | { success: true; ticketId: string; ready: boolean; missingItems?: string[] }
        | { success: false; error: string; detectedPlaceholders?: string[] }
      let out: UpdateResult
      try {
        let bodyMdTrimmed = input.body_md.trim()
        const placeholders = bodyMdTrimmed.match(PLACEHOLDER_RE) ?? []
        if (placeholders.length > 0) {
          const uniquePlaceholders = [...new Set(placeholders)]
          out = {
            success: false,
            error: `Ticket update rejected: unresolved template placeholder tokens detected. Detected placeholders: ${uniquePlaceholders.join(', ')}.`,
            detectedPlaceholders: uniquePlaceholders,
          }
          toolCalls.push({ name: 'update_ticket_body', input, output: out })
          return out
        }

        bodyMdTrimmed = normalizeBodyForReady(bodyMdTrimmed)

        // Fetch ticket to get display_id / pk for robust update.
        const fetchRes = await fetch(`${halBaseUrl}/api/tickets/get`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticketId: input.ticket_id }),
        })
        const fetched = (await fetchRes.json()) as any
        if (!fetched?.success || !fetched?.ticket) {
          out = { success: false, error: fetched?.error || `Ticket ${input.ticket_id} not found.` }
          toolCalls.push({ name: 'update_ticket_body', input, output: out })
          return out
        }

        const ticket = fetched.ticket as any
        const displayId = String(ticket.display_id || input.ticket_id)
        const ticketPk = typeof ticket.pk === 'string' ? ticket.pk : undefined
        const normalizedBodyMd = normalizeTitleLineInBody(bodyMdTrimmed, displayId)

        const updateRes = await fetch(`${halBaseUrl}/api/tickets/update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(ticketPk ? { ticketPk } : { ticketId: displayId }),
            body_md: normalizedBodyMd,
          }),
        })
        const updated = (await updateRes.json()) as any
        if (!updated?.success) {
          out = { success: false, error: updated?.error || 'Failed to update ticket' }
          toolCalls.push({ name: 'update_ticket_body', input, output: out })
          return out
        }

        const readiness = evaluateTicketReady(normalizedBodyMd)
        out = {
          success: true,
          ticketId: displayId,
          ready: readiness.ready,
          ...(readiness.missingItems.length > 0 ? { missingItems: readiness.missingItems } : {}),
        }
      } catch (err) {
        out = { success: false, error: err instanceof Error ? err.message : String(err) }
      }
      toolCalls.push({ name: 'update_ticket_body', input, output: out })
      return out
    },
  })

  const syncTicketsTool = tool({
    description:
      'Sync docs/tickets from Supabase. Disabled for PM agent: PM must be endpoint-only and must not require Supabase credentials in its environment.',
    parameters: z.object({}),
    execute: async () => {
      const out = {
        success: false as const,
        error:
          'sync_tickets is disabled for the PM agent. Supabase is the source of truth and should be accessed via HAL server endpoints; if you need a migration sync, run it server-side with privileged credentials.',
      }
      toolCalls.push({ name: 'sync_tickets', input: {}, output: out })
      return out
    },
  })

  const kanbanMoveTicketToTodoTool = tool({
    description:
      'Move a ticket from Unassigned to To Do via the HAL API. Only call after evaluate_ticket_ready returns ready: true.',
    parameters: z.object({
      ticket_id: z.string().describe('Ticket id (e.g. "HAL-0012", "0012", or "12").'),
    }),
    execute: async (input: { ticket_id: string }) => {
      type MoveResult =
        | { success: true; ticketId: string; fromColumn: string; toColumn: string }
        | { success: false; error: string }
      let out: MoveResult
      try {
        // Fetch current column and preferred display id
        const fetchRes = await fetch(`${halBaseUrl}/api/tickets/get`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticketId: input.ticket_id }),
        })
        const fetched = (await fetchRes.json()) as any
        if (!fetched?.success || !fetched?.ticket) {
          out = { success: false, error: fetched?.error || `Ticket ${input.ticket_id} not found.` }
          toolCalls.push({ name: 'kanban_move_ticket_to_todo', input, output: out })
          return out
        }
        const ticket = fetched.ticket as any
        const currentCol = ticket.kanban_column_id ?? null
        const inUnassigned = currentCol === COL_UNASSIGNED || currentCol === null || currentCol === ''
        if (!inUnassigned) {
          out = {
            success: false,
            error: `Ticket is not in Unassigned (current column: ${currentCol ?? 'null'}). Only tickets in Unassigned can be moved to To Do.`,
          }
          toolCalls.push({ name: 'kanban_move_ticket_to_todo', input, output: out })
          return out
        }
        const ticketIdToMove = String(ticket.display_id || input.ticket_id)
        const moveRes = await fetch(`${halBaseUrl}/api/tickets/move`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticketId: ticketIdToMove, columnId: COL_TODO, position: 'bottom' }),
        })
        const moved = (await moveRes.json()) as any
        if (!moved?.success) {
          out = { success: false, error: moved?.error || 'Failed to move ticket' }
        } else {
          out = { success: true, ticketId: ticketIdToMove, fromColumn: COL_UNASSIGNED, toColumn: COL_TODO }
        }
      } catch (err) {
        out = { success: false, error: err instanceof Error ? err.message : String(err) }
      }
      toolCalls.push({ name: 'kanban_move_ticket_to_todo', input, output: out })
      return out
    },
  })

  const listTicketsByColumnTool = tool({
    description:
      'List all tickets in a given Kanban column via the HAL API (server-side Supabase secret key).',
    parameters: z.object({
      column_id: z
        .string()
        .describe('Kanban column ID (e.g. "col-qa", "col-todo", "col-unassigned", "col-human-in-the-loop").'),
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
          typeof config.projectId === 'string' && config.projectId.trim() ? config.projectId.trim() : undefined
        const res = await fetch(`${halBaseUrl}/api/tickets/list-by-column`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ columnId: input.column_id, ...(repoFullName ? { repoFullName } : {}) }),
        })
        const data = (await res.json()) as any
        if (!data?.success) {
          out = { success: false, error: data?.error || 'Failed to list tickets' }
          toolCalls.push({ name: 'list_tickets_by_column', input, output: out })
          return out
        }
        const tickets = (Array.isArray(data.tickets) ? data.tickets : []).map((t: any) => ({
          id: t.display_id ?? t.id,
          title: t.title ?? '',
          column: input.column_id,
        }))
        out = { success: true, column_id: input.column_id, tickets, count: tickets.length }
      } catch (err) {
        out = { success: false, error: err instanceof Error ? err.message : String(err) }
      }
      toolCalls.push({ name: 'list_tickets_by_column', input, output: out })
      return out
    },
  })

  const moveTicketToColumnTool = (() => {
      return tool({
        description:
          'Move a ticket to a specified Kanban column by name (e.g. "Ready to Do", "QA", "Human in the Loop", "Will Not Implement") or column ID. Optionally specify position: "top", "bottom", or a numeric index (0-based). The Kanban UI will reflect the change within ~10 seconds. Use when the user asks to move a ticket to a named column or reorder within a column. For bulk moves, call this once per ticket (max 5 per request).',
        parameters: z
          .object({
            ticket_id: z.string().describe('Ticket ID (e.g. "HAL-0121", "0121", or "121").'),
            column_name: z
              .union([z.string(), z.null()])
              .describe(
                'Column name (e.g. "Ready to Do", "To Do", "QA", "Human in the Loop"). Pass null when using column_id.'
              ),
            column_id: z
              .union([z.string(), z.null()])
              .describe(
                'Column ID (e.g. "col-todo", "col-qa", "col-human-in-the-loop"). Pass null when using column_name.'
              ),
            position: z
              .union([z.string(), z.number(), z.null()])
              .describe(
                'Position in column: "top" (move to top), "bottom" (move to bottom, default), or a number (0-based index, e.g. 0 for first, 1 for second). Pass null for the default ("bottom").'
              ),
          })
          .refine(
            (input) =>
              (typeof input.column_name === 'string' && input.column_name.trim().length > 0) ||
              (typeof input.column_id === 'string' && input.column_id.trim().length > 0),
            {
              message: 'Either column_name or column_id must be provided.',
              path: ['column_name'],
            }
          ),
        execute: async (input: {
          ticket_id: string
          column_name: string | null
          column_id: string | null
          position: string | number | null
        }) => {
          type MoveResult =
            | {
                success: true
                ticket_id: string
                column_id: string
                column_name?: string
                position: number
                moved_at: string
              }
            | { success: false; error: string }
          let out: MoveResult
          try {
            const baseUrl = process.env.HAL_API_BASE_URL || 'https://portfolio-2026-hal.vercel.app'
            const columnName =
              typeof input.column_name === 'string' && input.column_name.trim().length > 0
                ? input.column_name
                : undefined
            const columnId =
              typeof input.column_id === 'string' && input.column_id.trim().length > 0
                ? input.column_id
                : undefined
            const position = input.position ?? undefined

            const response = await fetch(`${baseUrl}/api/tickets/move`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ticketId: input.ticket_id,
                columnId,
                columnName,
                position,
              }),
            })

            const result = await response.json()
            if (result.success) {
              out = {
                success: true,
                ticket_id: input.ticket_id,
                column_id: result.columnId,
                ...(result.columnName && { column_name: result.columnName }),
                position: result.position,
                moved_at: result.movedAt,
              }
            } else {
              out = { success: false, error: result.error || 'Failed to move ticket' }
            }
          } catch (err) {
            out = {
              success: false,
              error: err instanceof Error ? err.message : String(err),
            }
          }
          toolCalls.push({ name: 'move_ticket_to_column', input, output: out })
          return out
        },
      })
    })()

  const listAvailableReposTool = tool({
    description:
      'List all repositories (repo_full_name) that have tickets in the database via the HAL API.',
    parameters: z.object({}),
    execute: async () => {
      type ListReposResult =
        | { success: true; repos: Array<{ repo_full_name: string }>; count: number }
        | { success: false; error: string }
      let out: ListReposResult
      try {
        const res = await fetch(`${halBaseUrl}/api/tickets/list-repos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })
        const data = (await res.json()) as any
        if (!data?.success) {
          out = { success: false, error: data?.error || 'Failed to list repos' }
        } else {
          out = {
            success: true,
            repos: Array.isArray(data.repos) ? data.repos : [],
            count: typeof data.count === 'number' ? data.count : (Array.isArray(data.repos) ? data.repos.length : 0),
          }
        }
      } catch (err) {
        out = { success: false, error: err instanceof Error ? err.message : String(err) }
      }
      toolCalls.push({ name: 'list_available_repos', input: {}, output: out })
      return out
    },
  })

  const kanbanMoveTicketToOtherRepoTodoTool = tool({
    description:
      "Move a ticket to another repository's To Do. Disabled for PM agent until a dedicated HAL API endpoint exists (PM agent must be endpoint-only).",
    parameters: z.object({
      ticket_id: z.string().describe('Ticket id (e.g. "HAL-0012", "0012", or "12").'),
      target_repo_full_name: z.string().describe('Target repository full name (e.g. "owner/other-repo").'),
    }),
    execute: async (input: { ticket_id: string; target_repo_full_name: string }) => {
      const out = {
        success: false as const,
        error:
          'kanban_move_ticket_to_other_repo_todo is disabled: PM agent must not access Supabase directly, and there is not yet a HAL API endpoint for cross-repo moves.',
      }
      toolCalls.push({ name: 'kanban_move_ticket_to_other_repo_todo', input, output: out })
      return out
    },
  })

  const createRedDocumentTool = tool({
    description:
      'Create a Requirement Expansion Document (RED) for a ticket via the HAL API. RED documents are required before a ticket can be moved to To Do. The redJson should be a structured JSON object containing the expanded requirements.',
    parameters: z.object({
      ticket_id: z.string().describe('Ticket id (e.g. "HAL-0012", "0012", or "12").'),
      red_json: z.record(z.unknown()).describe('RED document content as a JSON object. Should contain expanded requirements, use cases, edge cases, and other detailed information.'),
      validation_status: z
        .enum(['valid', 'invalid', 'pending'])
        .optional()
        .describe('Validation status for the RED document. Defaults to "pending".'),
      created_by: z.string().optional().describe('Identifier for who created the RED document (e.g. "pm-agent", "user-name").'),
    }),
    execute: async (input: {
      ticket_id: string
      red_json: Record<string, unknown>
      validation_status?: 'valid' | 'invalid' | 'pending'
      created_by?: string
    }) => {
      type CreateRedResult =
        | {
            success: true
            red_document: {
              red_id: string
              version: number
              ticket_pk: string
              repo_full_name: string
            }
          }
        | { success: false; error: string }
      let out: CreateRedResult
      try {
        // Fetch ticket to get ticketPk and repoFullName
        const fetchRes = await fetch(`${halBaseUrl}/api/tickets/get`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticketId: input.ticket_id }),
        })
        const fetched = (await fetchRes.json()) as any
        if (!fetched?.success || !fetched?.ticket) {
          out = { success: false, error: fetched?.error || `Ticket ${input.ticket_id} not found.` }
          toolCalls.push({ name: 'create_red_document', input, output: out })
          return out
        }

        const ticket = fetched.ticket as any
        const ticketPk = typeof ticket.pk === 'string' ? ticket.pk : undefined
        const repoFullName = typeof ticket.repo_full_name === 'string' ? ticket.repo_full_name : undefined

        if (!ticketPk || !repoFullName) {
          out = {
            success: false,
            error: `Could not determine ticket_pk or repo_full_name for ticket ${input.ticket_id}.`,
          }
          toolCalls.push({ name: 'create_red_document', input, output: out })
          return out
        }

        // Create RED document via HAL API
        const createRes = await fetch(`${halBaseUrl}/api/red/insert`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticketPk,
            repoFullName,
            redJson: input.red_json,
            validationStatus: input.validation_status || 'pending',
            createdBy: input.created_by || 'pm-agent',
          }),
        })

        const created = (await createRes.json()) as any
        if (!created?.success || !created?.red_document) {
          out = { success: false, error: created?.error || 'Failed to create RED document' }
        } else {
          out = {
            success: true,
            red_document: {
              red_id: created.red_document.red_id,
              version: created.red_document.version,
              ticket_pk: ticketPk,
              repo_full_name: repoFullName,
            },
          }
        }
      } catch (err) {
        out = { success: false, error: err instanceof Error ? err.message : String(err) }
      }
      toolCalls.push({ name: 'create_red_document', input, output: out })
      return out
    },
  })

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

  const getInstructionSetTool = tool({
    description:
      'Load instruction content from HAL/Supabase. Use `agentType` to load a full agent instruction set (plus additional topic index), or `topicId` to load one specific topic.',
    parameters: z
      .object({
        topicId: z
          .string()
          .nullable()
          .describe(
            'Specific instruction topic ID (e.g., "auditability-and-traceability", "qa-audit-report", "done-means-pushed"). Set to null when loading by agentType.'
          ),
        agentType: z
          .enum([
            'project-manager',
            'implementation-agent',
            'qa-agent',
            'process-review-agent',
          ])
          .nullable()
          .describe(
            'Agent type for full instruction-set loading (loads all basic instructions for that agent plus additional topics). Set to null when loading a specific topic by topicId.'
          ),
      })
      .refine((value) => Boolean((value.topicId ?? '').trim() || value.agentType), {
        message: 'Provide either topicId or agentType.',
      }),
    execute: async (input) => {
      try {
        const repoFullName = config.repoFullName || config.projectId || 'beardedphil/portfolio-2026-hal'
        const agentTypeLabels: Record<
          'project-manager' | 'implementation-agent' | 'qa-agent' | 'process-review-agent',
          string
        > = {
          'project-manager': 'Project Manager',
          'implementation-agent': 'Implementation Agent',
          'qa-agent': 'QA Agent',
          'process-review-agent': 'Process Review Agent',
        }

        const topicId = (input.topicId ?? '').trim()

        // First mode: full instruction set by agent type.
        if (input.agentType) {
          const targetAgentType = input.agentType
          type AgentInstruction = {
            topicId: string
            filename: string
            title: string
            description: string
            content: string
            agentTypes: string[]
            alwaysApply: boolean
          }

          const mapHalInstruction = (raw: Record<string, unknown>): AgentInstruction => {
            const rawTopicId = typeof raw.topicId === 'string' ? raw.topicId.trim() : ''
            const rawFilename = typeof raw.filename === 'string' ? raw.filename.trim() : ''
            const topicIdValue = rawTopicId || rawFilename.replace(/\.mdc$/i, '')
            const filenameValue = rawFilename || `${topicIdValue || 'unknown'}.mdc`
            const topicMeta = raw.topicMetadata as { title?: string; description?: string } | undefined
            const titleValue =
              (typeof raw.title === 'string' ? raw.title.trim() : '') ||
              topicMeta?.title ||
              filenameValue.replace(/\.mdc$/i, '').replace(/-/g, ' ')
            const descriptionValue =
              (typeof raw.description === 'string' ? raw.description.trim() : '') ||
              topicMeta?.description ||
              'No description'
            const contentValue =
              typeof raw.contentMd === 'string'
                ? raw.contentMd
                : typeof raw.contentBody === 'string'
                  ? raw.contentBody
                  : ''
            const agentTypesValue = Array.isArray(raw.agentTypes)
              ? raw.agentTypes.filter((v): v is string => typeof v === 'string')
              : []
            return {
              topicId: topicIdValue,
              filename: filenameValue,
              title: titleValue,
              description: descriptionValue,
              content: contentValue,
              agentTypes: agentTypesValue,
              alwaysApply: raw.alwaysApply === true,
            }
          }

          const dedupeTopics = (topics: Array<{ topicId: string; title: string; description: string }>) => {
            const seen = new Set<string>()
            const unique: Array<{ topicId: string; title: string; description: string }> = []
            for (const topic of topics) {
              if (!topic.topicId || seen.has(topic.topicId)) continue
              seen.add(topic.topicId)
              unique.push(topic)
            }
            return unique.sort((a, b) => a.topicId.localeCompare(b.topicId))
          }

          let basicInstructions: AgentInstruction[] = []
          let additionalTopicCandidates: AgentInstruction[] = []

          // Try HAL API first (preferred path)
          let halBaseUrl: string | null = null
          try {
            const apiBaseUrlPath = path.join(config.repoRoot, '.hal', 'api-base-url')
            const apiBaseUrlContent = await fs.readFile(apiBaseUrlPath, 'utf8')
            halBaseUrl = apiBaseUrlContent.trim()
          } catch {
            // .hal/api-base-url missing, try direct Supabase fallback.
          }

          if (halBaseUrl) {
            try {
              const [basicRes, situationalRes] = await Promise.all([
                fetch(`${halBaseUrl}/api/instructions/get`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    repoFullName,
                    agentType: targetAgentType,
                    includeBasic: true,
                    includeSituational: false,
                  }),
                }),
                fetch(`${halBaseUrl}/api/instructions/get`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    repoFullName,
                    agentType: targetAgentType,
                    includeBasic: false,
                    includeSituational: true,
                  }),
                }),
              ])

              if (basicRes.ok) {
                const basicData = (await basicRes.json()) as {
                  success?: boolean
                  instructions?: Array<Record<string, unknown>>
                }
                if (basicData.success && Array.isArray(basicData.instructions)) {
                  basicInstructions = basicData.instructions.map(mapHalInstruction)
                }
              }

              if (situationalRes.ok) {
                const situationalData = (await situationalRes.json()) as {
                  success?: boolean
                  instructions?: Array<Record<string, unknown>>
                }
                if (situationalData.success && Array.isArray(situationalData.instructions)) {
                  additionalTopicCandidates = situationalData.instructions.map(mapHalInstruction)
                }
              }
            } catch (apiErr) {
              console.warn('[PM Agent] HAL API agent instruction-set fetch failed, falling back:', apiErr)
            }
          }

          // No direct Supabase fallback: PM agent must be endpoint-only.

          if (basicInstructions.length === 0 && additionalTopicCandidates.length === 0) {
            const error = {
              error: `No instruction set found for agentType "${targetAgentType}". Ensure HAL/Supabase instruction data is available.`,
            }
            toolCalls.push({ name: 'get_instruction_set', input, output: error })
            return error
          }

          const additionalTopics = dedupeTopics(
            additionalTopicCandidates.map((inst) => ({
              topicId: inst.topicId,
              title: inst.title,
              description: inst.description,
            }))
          )

          const contentSections: string[] = []
          contentSections.push(`# Instruction set for ${agentTypeLabels[targetAgentType]}`)
          contentSections.push(
            `Loaded ${basicInstructions.length} basic instruction${basicInstructions.length === 1 ? '' : 's'} for \`${targetAgentType}\`.`
          )

          if (basicInstructions.length > 0) {
            contentSections.push('## Basic instructions (full set)')
            for (const inst of basicInstructions) {
              contentSections.push(`### ${inst.title} (\`${inst.topicId}\`)`)
              contentSections.push(inst.content)
            }
          }

          if (additionalTopics.length > 0) {
            contentSections.push('## Additional topics (request on-demand)')
            for (const topic of additionalTopics) {
              contentSections.push(
                `- **${topic.title}** (ID: \`${topic.topicId}\`): ${topic.description}`
              )
            }
            contentSections.push(
              'Request a topic with `get_instruction_set({ topicId: "<topic-id>" })` when a specific workflow is needed.'
            )
          }

          const result = {
            mode: 'agent-type',
            agentType: targetAgentType,
            title: `Instruction set for ${agentTypeLabels[targetAgentType]}`,
            basicInstructions: basicInstructions.map((inst) => ({
              topicId: inst.topicId,
              title: inst.title,
              description: inst.description,
              content: inst.content,
            })),
            additionalTopics,
            content: contentSections.join('\n\n'),
          }
          toolCalls.push({ name: 'get_instruction_set', input, output: result })
          return result
        }

        // Second mode: fetch one topic by topicId.
        if (!topicId) {
          const error = { error: 'Either topicId or agentType is required.' }
          toolCalls.push({ name: 'get_instruction_set', input, output: error })
          return error
        }

        // Try HAL API first (preferred method)
        let halBaseUrl: string | null = null
        try {
          const apiBaseUrlPath = path.join(config.repoRoot, '.hal', 'api-base-url')
          const apiBaseUrlContent = await fs.readFile(apiBaseUrlPath, 'utf8')
          halBaseUrl = apiBaseUrlContent.trim()
        } catch {
          // .hal/api-base-url not found, will try direct Supabase
        }

        if (halBaseUrl) {
          try {
            const res = await fetch(`${halBaseUrl}/api/instructions/get-topic`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                topicId,
                repoFullName,
              }),
            })

            if (res.ok) {
              const data = await res.json()
              if (data.success) {
                const result = {
                  topicId: data.topicId,
                  title: data.title,
                  description: data.description,
                  content: data.content || data.contentMd || '',
                }
                toolCalls.push({ name: 'get_instruction_set', input, output: result })
                return result
              } else {
                return { error: data.error || 'Failed to load instruction topic' }
              }
            }
          } catch (apiErr) {
            // HAL API failed, fall through to direct Supabase
            console.warn('[PM Agent] HAL API instruction topic fetch failed, falling back:', apiErr)
          }
        }

        // No direct Supabase fallback: PM agent must be endpoint-only.

        // Fallback to filesystem: Individual instruction files have been migrated to Supabase
        // The filesystem fallback can only provide the entry point file, not individual topics
        return { 
          error: `Cannot load instruction topic "${topicId}" from filesystem. Individual instruction files have been migrated to Supabase. Use HAL API endpoint \`/api/instructions/get-topic\` or direct Supabase access to retrieve instructions. If Supabase/HAL API is not available, instructions cannot be loaded.`
        }
      } catch (err) {
        const error = { 
          error: `Error loading instruction set: ${err instanceof Error ? err.message : String(err)}` 
        }
        toolCalls.push({ name: 'get_instruction_set', input, output: error })
        return error
      }
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
    get_instruction_set: getInstructionSetTool,
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
    ...(attachImageToTicketTool ? { attach_image_to_ticket: attachImageToTicketTool } : {}),
    evaluate_ticket_ready: evaluateTicketReadyTool,
    ...(updateTicketBodyTool ? { update_ticket_body: updateTicketBodyTool } : {}),
    ...(syncTicketsTool ? { sync_tickets: syncTicketsTool } : {}),
    ...(kanbanMoveTicketToTodoTool ? { kanban_move_ticket_to_todo: kanbanMoveTicketToTodoTool } : {}),
    ...(listTicketsByColumnTool ? { list_tickets_by_column: listTicketsByColumnTool } : {}),
    ...(moveTicketToColumnTool ? { move_ticket_to_column: moveTicketToColumnTool } : {}),
    ...(listAvailableReposTool ? { list_available_repos: listAvailableReposTool } : {}),
    ...(kanbanMoveTicketToOtherRepoTodoTool
      ? { kanban_move_ticket_to_other_repo_todo: kanbanMoveTicketToOtherRepoTodoTool }
      : {}),
    ...(createRedDocumentTool ? { create_red_document: createRedDocumentTool } : {}),
  }

  const promptBase = `${contextPack}\n\n---\n\nRespond to the user message above using the tools as needed.`

  // Build full prompt text for display (system instructions + context pack + user message + images if present)
  const hasImages = config.images && config.images.length > 0
  const isVisionModel = config.openaiModel.includes('vision') || config.openaiModel.includes('gpt-4o')
  let imageInfo = ''
  if (hasImages) {
    const imageList = config.images!.map((img, idx) => `  ${idx + 1}. ${img.filename || `Image ${idx + 1}`} (${img.mimeType || 'image'})`).join('\n')
    if (isVisionModel) {
      imageInfo = `\n\n## Images (included in prompt)\n\n${imageList}\n\n(Note: Images are sent as base64-encoded data URLs in the prompt array, but are not shown in this text representation.)`
    } else {
      imageInfo = `\n\n## Images (provided but ignored)\n\n${imageList}\n\n(Note: Images were provided but the model (${config.openaiModel}) does not support vision. Images are ignored.)`
    }
  }
  const fullPromptText = `## System Instructions\n\n${PM_SYSTEM_INSTRUCTIONS}\n\n---\n\n## User Prompt\n\n${promptBase}${imageInfo}`

  // Build prompt with images if present
  // For vision models, prompt must be an array of content parts
  // For non-vision models, prompt is a string (images are ignored)
  // Note: hasImages and isVisionModel are already defined above when building fullPromptText
  
  let prompt: string | Array<{ type: 'text' | 'image'; text?: string; image?: string }>
  if (hasImages && isVisionModel) {
    // Vision model: use array format with text and images
    prompt = [
      { type: 'text' as const, text: promptBase },
      ...config.images!.map((img) => ({ type: 'image' as const, image: img.dataUrl })),
    ]
    // For vision models, note that images are included but not shown in text representation
    // The fullPromptText will show the text portion
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
                reply = `I updated the body of ticket **${out.ticketId}** via the HAL API. The Kanban UI will reflect the change within ~10 seconds.`
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
      // Include full prompt text for display (0202)
      promptText: fullPromptText,
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
      // Include full prompt text even on error (0202)
      promptText: fullPromptText,
    }
  }
}

