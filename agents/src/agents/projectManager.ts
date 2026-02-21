/**
 * Project Manager agent — context pack, read-only tools, OpenAI Responses API.
 * Module: portfolio-2026-hal-agents (no server required).
 * 
 * This file re-exports all PM agent functionality from modular sub-files.
 */

import { createOpenAI } from '@ai-sdk/openai'
import { streamText, jsonSchema, tool } from 'ai'
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
import {
  isAbortError as isAbortErrorHelper,
} from './projectManager/replyGeneration.js'
import { createTools, type ToolDependencies } from './projectManager/toolDefinitions.js'
import { buildPrompt, type PromptBuildingConfig } from './projectManager/promptBuilding.js'
import { executeTools, type ToolExecutionConfig } from './projectManager/toolExecution.js'

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

**If instruction loading fails:** You are NOT blocked. Proceed using the fallback templates and workflows in this message. Do not refuse to complete actions solely because \`get_instruction_set\` failed.

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

**Fallback RED template (use when RED instructions are unavailable):** When you need to create a RED (Requirement Expansion Document) and you cannot load a RED template from instructions, create a RED using \`create_red_document_v2\` with \`red_json_content\` set to a JSON string matching this shape:

\`\`\`json
{
  "ticket_id": "HAL-0713",
  "summary": "One-paragraph expansion of what we’re building and why.",
  "goal": "Restate Goal section in one sentence.",
  "deliverable": "Restate Human-verifiable deliverable in one sentence.",
  "acceptance_criteria": ["Checkbox AC items copied verbatim, without placeholders."],
  "scope": {
    "in_scope": ["Concrete items that must be delivered."],
    "out_of_scope": ["Non-goals copied verbatim."]
  },
  "constraints": ["Constraints copied verbatim."],
  "assumptions": ["Any assumptions needed to proceed."],
  "dependencies": ["Any external deps, migrations, or secrets required."],
  "use_cases": ["User stories / flows (happy path + key variants)."],
  "edge_cases": ["Notable edge cases to handle."],
  "risks": ["Technical/product risks + mitigations."],
  "test_plan": ["Steps to verify the deliverable works."],
  "rollout": ["If applicable: rollout/flagging/backout plan."],
  "open_questions": ["Anything still unknown that blocks or could change scope."]
}
\`\`\`

Keep it concise but complete. Prefer arrays of strings; avoid deeply nested structures.

**Moving a ticket to To Do:** When the user asks to move a ticket to To Do (e.g. "move this to To Do", "move ticket 0012 to To Do"), you MUST (1) fetch the ticket content with fetch_ticket_content (by ticket id), (2) evaluate readiness with evaluate_ticket_ready (pass the body_md from the fetch result). If the ticket is NOT ready, do NOT call kanban_move_ticket_to_todo; instead reply with a clear list of what is missing (use the missingItems from the evaluate_ticket_ready result). (3) If the ticket IS ready, call kanban_move_ticket_to_todo with the ticket id. If the move fails with "RED document is required", create a RED document using create_red_document_v2, then retry the move. Then confirm in chat that the ticket was moved. The readiness checklist is in your instructions (topic: ready-to-start-checklist): Goal, Human-verifiable deliverable, Acceptance criteria checkboxes, Constraints, Non-goals, no unresolved placeholders, RED document.

**Preparing a ticket (Definition of Ready):** When the user asks to "prepare ticket X" or "get ticket X ready" (e.g. from "Prepare top ticket" button), you MUST (1) fetch the ticket content with fetch_ticket_content, (2) evaluate readiness with evaluate_ticket_ready. If the ticket is NOT ready, use update_ticket_body to fix formatting issues (normalize headings, convert bullets to checkboxes in Acceptance criteria if needed, ensure all required sections exist). After updating, re-evaluate with evaluate_ticket_ready. (3) Check if a RED document exists for the ticket (if moving to To Do fails with "RED document is required", create one using create_red_document_v2). (4) If the ticket IS ready (after fixes if needed) and has a RED document, automatically call kanban_move_ticket_to_todo with position: "top" to move it to To Do and place it at the top of the column (position 0). Then confirm in chat that the ticket is Ready-to-start and has been moved to To Do. If the ticket cannot be made ready (e.g. missing required content that cannot be auto-generated), clearly explain what is missing and that the ticket remains in Unassigned.

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
  config: PmAgentConfig & {
    onTextDelta?: (delta: string) => void | Promise<void>
    onProgress?: (message: string) => void | Promise<void>
    abortSignal?: AbortSignal
  }
): Promise<PmAgentResult> {
  const toolCalls: ToolCallRecord[] = []
  let capturedRequest: object | null = null

  const ctx: ToolContext = { repoRoot: config.repoRoot }

  // Tool schemas sent to OpenAI must be valid JSON Schema.
  // In particular, any schema with `{ type: "array" }` must define `items`.
  // Define a proper recursive JSON value schema so we never emit array schemas
  // without `items` (a common pitfall of "unknown/any" conversions).
  // OpenAI tool schema validation is stricter than generic JSON Schema.
  // For create_red_document, we use an explicit JSON Schema (via jsonSchema())
  // so we can control `required` and avoid `$ref` / recursive schemas under additionalProperties/items.

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

  const isAbortError = (err: unknown) => isAbortErrorHelper(err, config.abortSignal)

  const halFetchJson = async (
    path: string,
    body: unknown,
    opts?: { timeoutMs?: number; progressMessage?: string }
  ) => {
    const timeoutMs = Math.max(1_000, Math.floor(opts?.timeoutMs ?? 20_000))
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(new Error('HAL request timeout')), timeoutMs)
    const onAbort = () => controller.abort(config.abortSignal?.reason ?? new Error('Aborted'))
    try {
      const progress = String(opts?.progressMessage ?? '').trim()
      if (progress) await config.onProgress?.(progress)
      if (config.abortSignal) config.abortSignal.addEventListener('abort', onAbort, { once: true })
      const res = await fetch(`${halBaseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
        signal: controller.signal,
      })
      const text = await res.text()
      let json: any = {}
      if (text) {
        try {
          json = JSON.parse(text)
        } catch (e) {
          const contentType = res.headers.get('content-type') || 'unknown'
          const prefix = text.slice(0, 200)
          json = {
            success: false,
            error: `Non-JSON response from ${path} (HTTP ${res.status}, content-type: ${contentType}): ${prefix}`,
          }
        }
      }
      return { ok: res.ok, json }
    } finally {
      clearTimeout(t)
      try {
        if (config.abortSignal) config.abortSignal.removeEventListener('abort', onAbort)
      } catch {
        // ignore
      }
    }
  }

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

  // Tool definitions moved to toolDefinitions.ts module
  // Creating tools using extracted module:
  const toolDeps: ToolDependencies = {
    toolCalls,
    halFetchJson,
    config: {
      projectId: config.projectId,
      repoRoot: config.repoRoot,
      repoFullName: config.repoFullName,
      githubReadFile: config.githubReadFile,
      githubSearchCode: config.githubSearchCode,
      githubListDirectory: config.githubListDirectory,
    },
    isAbortError,
    ctx,
    hasGitHubRepo,
    repoUsage,
  }
  const tools = createTools(toolDeps)

  // Build prompt using extracted module
  const promptConfig: PromptBuildingConfig = {
    contextPack,
    systemInstructions: PM_SYSTEM_INSTRUCTIONS,
    images: config.images,
    openaiModel: config.openaiModel,
  }
  const { prompt, fullPromptText } = buildPrompt(promptConfig)

  // Execute tools using extracted module
  const executionConfig: ToolExecutionConfig = {
    model,
    systemInstructions: PM_SYSTEM_INSTRUCTIONS,
    prompt,
    tools,
    maxToolIterations: MAX_TOOL_ITERATIONS,
    previousResponseId: config.previousResponseId,
    abortSignal: config.abortSignal,
    onTextDelta: config.onTextDelta,
    capturedRequest,
    isAbortError,
  }
  
  const executionResult = await executeTools(executionConfig)

  return {
    ...executionResult,
    // Include repo usage for debugging (0119)
    _repoUsage: repoUsage.length > 0 ? repoUsage : undefined,
    // Include full prompt text for display (0202)
    promptText: fullPromptText,
  }
}

// Schema fix deployed
