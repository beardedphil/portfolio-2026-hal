/**
 * Main PM agent runner.
 */

import { createOpenAI } from '@ai-sdk/openai'
import { generateText, tool } from 'ai'
import { z } from 'zod'
import fs from 'fs/promises'
import path from 'path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { redact } from '../../utils/redact.js'
import {
  normalizeBodyForReady,
  normalizeTitleLineInBody,
} from '../../lib/ticketBodyNormalization.js'
import {
  repoHintPrefix,
  parseTicketNumber,
  evaluateTicketReady,
  PLACEHOLDER_RE,
} from '../../lib/projectManagerHelpers.js'
import {
  listDirectory,
  readFile,
  searchFiles,
  type ToolContext,
} from '../tools.js'
import { buildContextPack } from './contextPack.js'
import { createCreateTicketTool, isUnknownColumnError } from './ticketTools.js'
import type { PmAgentConfig, PmAgentResult, ToolCallRecord } from './types.js'

// Re-export for backward compatibility (used by tests)
export { isUnknownColumnError, isUniqueViolation } from './ticketTools.js'

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

**Creating tickets:** When the user **explicitly** asks to create a ticket (e.g. "create a ticket", "create ticket for that", "create a new ticket for X"), you MUST call the create_ticket tool if it is available. Do NOT call create_ticket for short, non-actionable messages such as: "test", "ok", "hi", "hello", "thanks", "cool", "checking", "asdf", or similar—these are usually the user testing the UI, acknowledging, or typing casually. Do not infer a ticket-creation request from context alone (e.g. if the user sends "Test" while testing the chat UI, that does NOT mean create the chat UI ticket). Calling the tool is what actually creates the ticket—do not only write the ticket content in your message. Use create_ticket with a short title (without the ID prefix—the tool assigns the next repo-scoped ID and normalizes the Title line to "PREFIX-NNNN — ..."). Provide a full markdown body following the repo ticket template. Do not invent an ID—the tool assigns it. Do not write secrets or API keys into the ticket body. If create_ticket is not in your tool list, tell the user: "I don't have the create-ticket tool for this request. In the HAL app, connect the project folder (with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in its .env), then try again. Check Diagnostics to confirm 'Create ticket (this request): Available'." After creating a ticket via the tool, report the exact ticket display ID (e.g. HAL-0079) and the returned filePath (Supabase-only).

**Moving a ticket to To Do:** When the user asks to move a ticket to To Do (e.g. "move this to To Do", "move ticket 0012 to To Do"), you MUST (1) fetch the ticket content with fetch_ticket_content (by ticket id), (2) evaluate readiness with evaluate_ticket_ready (pass the body_md from the fetch result). If the ticket is NOT ready, do NOT call move_ticket_to_column; instead reply with a clear list of what is missing (use the missingItems from the evaluate_ticket_ready result). If the ticket IS ready, call move_ticket_to_column with ticket_id and column_id: "col-todo". Then confirm in chat that the ticket was moved. The readiness checklist is in your instructions (topic: ready-to-start-checklist): Goal, Human-verifiable deliverable, Acceptance criteria checkboxes, Constraints, Non-goals, no unresolved placeholders.

**Preparing a ticket (Definition of Ready):** When the user asks to "prepare ticket X" or "get ticket X ready" (e.g. from "Prepare top ticket" button), you MUST (1) fetch the ticket content with fetch_ticket_content, (2) evaluate readiness with evaluate_ticket_ready. If the ticket is NOT ready, use update_ticket_body to fix formatting issues (normalize headings, convert bullets to checkboxes in Acceptance criteria if needed, ensure all required sections exist). After updating, re-evaluate with evaluate_ticket_ready. If the ticket IS ready (after fixes if needed), you MUST automatically call move_ticket_to_column with ticket_id and column_id: "col-todo" to move it to To Do. Then confirm in chat that the ticket is Ready-to-start and has been moved to To Do. If the ticket cannot be made ready (e.g. missing required content that cannot be auto-generated), clearly explain what is missing and that the ticket remains in Unassigned. IMPORTANT: The move_ticket_to_column tool is always available when Supabase is connected - use it to move tickets, do not claim you cannot move tickets.

**Listing tickets by column:** When the user asks to see tickets in a specific Kanban column (e.g. "list tickets in QA column", "what tickets are in QA", "show me tickets in the QA column"), use list_tickets_by_column with the appropriate column_id (e.g. "col-qa" for QA, "col-todo" for To Do, "col-unassigned" for Unassigned, "col-human-in-the-loop" for Human in the Loop). Format the results clearly in your reply, showing ticket ID and title for each ticket. This helps you see which tickets are currently in a given column so you can update other tickets without asking the user for IDs.

**Moving tickets to named columns:** When the user asks to move a ticket to a column by name (e.g. "move HAL-0121 to Ready to Do", "put ticket 0121 in QA", "move this to Human in the Loop"), use move_ticket_to_column with the ticket_id and column_name. You can also specify position: "top" (move to top of column), "bottom" (move to bottom, default), or a number (0-based index, e.g. 0 for first position, 1 for second). The tool automatically resolves column names to column IDs. After moving, confirm the ticket appears in the specified column and position in the Kanban UI.

**Bulk operations (move all / move multiple):** When the user asks to move ALL tickets from one column to another (e.g. "move all tickets from Unassigned to Will Not Implement", "move everything in Unassigned to To Do"), you MUST process in batches to avoid timeouts. (1) Call list_tickets_by_column with the source column (e.g. col-unassigned) to get the tickets. (2) Process at most 5 tickets per request: call move_ticket_to_column for each of the first 5 tickets, then stop. (3) In your reply, state how many you moved and how many remain. If any remain, end with: "Reply with **Continue** to move the next batch." The user can then say "Continue" (or "continue") and you will list the source column again (which now has fewer tickets), move the next batch of up to 5, and repeat until all are moved. Do NOT attempt to move more than 5 tickets in a single request—this causes timeouts.

**Continue (batch operations):** When the user says "Continue", "continue", or similar, check the conversation: if your previous reply ended with "Reply with **Continue** to move the next batch", then list the source column again, move up to 5 more tickets, and report progress. If more remain, again end with "Reply with **Continue** to move the next batch." If none remain, confirm that all tickets have been moved.

**Moving tickets to other repositories:** When the user asks to move a ticket to another repository's To Do column (e.g. "Move ticket HAL-0012 to owner/other-repo To Do"), use kanban_move_ticket_to_other_repo_todo with the ticket_id and target_repo_full_name. This tool works from any Kanban column (not only Unassigned). The ticket will be moved to the target repository and placed in its To Do column, and the ticket's display_id will be updated to match the target repo's prefix. If the target repo does not exist or the user lacks access, the tool will return a clear error message. If the ticket ID is invalid or not found, the tool will return a clear error message. After a successful move, confirm in chat the target repository and that the ticket is now in To Do.

**Listing available repositories:** When the user asks "what repos can I move tickets to?" or similar questions about available target repositories, use list_available_repos to get a list of all repositories (repo_full_name) that have tickets in the database. Format the results clearly in your reply, showing the repository names.

**Supabase is the source of truth for ticket content.** When the user asks to edit or fix a ticket, you must update the ticket in the database (do not suggest editing docs/tickets/*.md only). Use update_ticket_body to write the corrected body_md directly to Supabase. The change propagates out: the Kanban UI reflects it within ~10 seconds (poll interval). To propagate the same content to docs/tickets/*.md in the repo, use the sync_tickets tool (if available) after updating—sync writes from DB to docs so the repo files match Supabase.

**Editing ticket body in Supabase:** When a ticket in Unassigned fails the Definition of Ready (missing sections, placeholders, etc.) and the user asks to fix it or make it ready, use update_ticket_body to write the corrected body_md directly to Supabase. Provide the full markdown body with all required sections: Goal (one sentence), Human-verifiable deliverable (UI-only), Acceptance criteria (UI-only) with - [ ] checkboxes, Constraints, Non-goals. Replace every placeholder with concrete content. The Kanban UI reflects updates within ~10 seconds. Optionally call sync_tickets afterward so docs/tickets/*.md match the database.

**Attaching images to tickets:** When a user uploads an image in chat and asks to attach it to a ticket (e.g. "Add this image to ticket HAL-0143"), use attach_image_to_ticket with the ticket ID. Images are available from recent conversation messages (persisted to database) as well as the current request. The tool automatically accesses images from recent messages and the current conversation turn. If multiple images are available, you can specify image_index (0-based) to select which image to attach. The image will appear in the ticket's Artifacts section. The tool prevents duplicate attachments of the same image.

Always cite file paths when referencing specific content.`

const MAX_TOOL_ITERATIONS = 10

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

  const createTicketTool = createCreateTicketTool(config, toolCalls)

  const fetchTicketContentTool =
    hasSupabase &&
    (() => {
      const supabase: SupabaseClient = createClient(
        config.supabaseUrl!.trim(),
        config.supabaseAnonKey!.trim()
      )
      return tool({
        description:
          'Fetch the full ticket content (body_md, title, id/display_id, kanban_column_id) and attached artifacts for a ticket from Supabase. Supabase-only mode (0065). In repo-scoped mode (0079), tickets are resolved by (repo_full_name, ticket_number). Returns full ticket record with artifacts in a forward-compatible way. The response includes artifact_summary with name/type, snippet/length, timestamps, and blank detection for each artifact, making it easy to diagnose duplicates or blank artifacts.',
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
                // Forward-compatible: include full ticket record
                ticket?: Record<string, any>
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
              // Select all fields for forward compatibility
              const { data: row, error } = await supabase
                .from('tickets')
                .select('*')
                .eq('repo_full_name', repoFullName)
                .eq('ticket_number', ticketNumber)
                .maybeSingle()
              if (!error && row) {
                // Fetch artifacts for this ticket
                let artifacts: any[] = []
                let artifactsError: string | null = null
                const ticketPk = (row as any).pk
                if (ticketPk) {
                  try {
                    const { data: artifactsData, error: artifactsErr } = await supabase
                      .from('agent_artifacts')
                      .select('artifact_id, ticket_pk, repo_full_name, agent_type, title, body_md, created_at, updated_at')
                      .eq('ticket_pk', ticketPk)
                      .order('created_at', { ascending: false })

                    if (artifactsErr) {
                      artifactsError = `Failed to fetch artifacts: ${artifactsErr.message}`
                    } else {
                      artifacts = artifactsData || []
                    }
                  } catch (err) {
                    artifactsError = err instanceof Error ? err.message : String(err)
                  }
                }

                out = {
                  success: true,
                  id: (row as any).id,
                  display_id: (row as any).display_id ?? undefined,
                  ticket_number: (row as any).ticket_number ?? undefined,
                  repo_full_name: (row as any).repo_full_name ?? undefined,
                  title: (row as any).title ?? '',
                  body_md: (row as any).body_md ?? '',
                  kanban_column_id: (row as any).kanban_column_id ?? null,
                  artifacts: artifacts,
                  ...(artifactsError ? { artifacts_error: artifactsError } : {}),
                  ticket: row, // Full ticket record for forward compatibility
                }
                toolCalls.push({ name: 'fetch_ticket_content', input, output: out })
                return out
              }
              if (error && isUnknownColumnError(error)) {
                // Legacy schema fallback: global id
                const { data: legacyRow, error: legacyErr } = await supabase
                  .from('tickets')
                  .select('*')
                  .eq('id', normalizedId)
                  .maybeSingle()
                if (!legacyErr && legacyRow) {
                  // Fetch artifacts for legacy ticket
                  let artifacts: any[] = []
                  let artifactsError: string | null = null
                  const ticketPk = (legacyRow as any).pk
                  if (ticketPk) {
                    try {
                      const { data: artifactsData, error: artifactsErr } = await supabase
                        .from('agent_artifacts')
                        .select('artifact_id, ticket_pk, repo_full_name, agent_type, title, body_md, created_at, updated_at')
                        .eq('ticket_pk', ticketPk)
                        .order('created_at', { ascending: false })

                      if (artifactsErr) {
                        artifactsError = `Failed to fetch artifacts: ${artifactsErr.message}`
                      } else {
                        artifacts = artifactsData || []
                      }
                    } catch (err) {
                      artifactsError = err instanceof Error ? err.message : String(err)
                    }
                  }

                  out = {
                    success: true,
                    id: (legacyRow as any).id,
                    title: (legacyRow as any).title ?? '',
                    body_md: (legacyRow as any).body_md ?? '',
                    kanban_column_id: (legacyRow as any).kanban_column_id ?? null,
                    artifacts: artifacts,
                    ...(artifactsError ? { artifacts_error: artifactsError } : {}),
                    ticket: legacyRow, // Full ticket record for forward compatibility
                  }
                  toolCalls.push({ name: 'fetch_ticket_content', input, output: out })
                  return out
                }
              }
            } else {
              // If no repo is connected, keep legacy behavior (global id) so "legacy/unknown" tickets remain reachable.
              const { data: legacyRow, error: legacyErr } = await supabase
                .from('tickets')
                .select('*')
                .eq('id', normalizedId)
                .maybeSingle()
              if (!legacyErr && legacyRow) {
                // Fetch artifacts for legacy ticket
                let artifacts: any[] = []
                let artifactsError: string | null = null
                const ticketPk = (legacyRow as any).pk
                if (ticketPk) {
                  try {
                    const { data: artifactsData, error: artifactsErr } = await supabase
                      .from('agent_artifacts')
                      .select('artifact_id, ticket_pk, repo_full_name, agent_type, title, body_md, created_at, updated_at')
                      .eq('ticket_pk', ticketPk)
                      .order('created_at', { ascending: false })

                    if (artifactsErr) {
                      artifactsError = `Failed to fetch artifacts: ${artifactsErr.message}`
                    } else {
                      artifacts = artifactsData || []
                    }
                  } catch (err) {
                    artifactsError = err instanceof Error ? err.message : String(err)
                  }
                }

                out = {
                  success: true,
                  id: (legacyRow as any).id,
                  title: (legacyRow as any).title ?? '',
                  body_md: (legacyRow as any).body_md ?? '',
                  kanban_column_id: (legacyRow as any).kanban_column_id ?? null,
                  artifacts: artifacts,
                  ...(artifactsError ? { artifacts_error: artifactsError } : {}),
                  ticket: legacyRow, // Full ticket record for forward compatibility
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

  const attachImageToTicketTool =
    hasSupabase &&
    (() => {
      const supabase: SupabaseClient = createClient(
        config.supabaseUrl!.trim(),
        config.supabaseAnonKey!.trim()
      )
      return tool({
        description:
          'Attach an uploaded image to a ticket as an artifact. The image must have been uploaded in the current conversation turn. Use when the user asks to attach an image to a ticket (e.g. "Add this image to ticket HAL-0143"). The image will appear in the ticket\'s Artifacts section.',
        parameters: z.object({
          ticket_id: z.string().describe('Ticket ID (e.g. "HAL-0143", "0143", or "143").'),
          image_index: z
            .number()
            .int()
            .min(0)
            .describe('Zero-based index of the image to attach. Use 0 for the first image (and when only one image was uploaded).'),
        }),
        execute: async (input: { ticket_id: string; image_index?: number }) => {
          type AttachResult =
            | { success: true; artifact_id: string; ticket_id: string; image_filename: string }
            | { success: false; error: string }
          let out: AttachResult
          try {
            // Debug: log image availability
            console.warn(`[PM] attach_image_to_ticket called: hasImages=${!!config.images}, imageCount=${config.images?.length || 0}, images=${config.images ? JSON.stringify(config.images.map(img => ({ filename: img.filename, mimeType: img.mimeType, dataUrlLength: img.dataUrl?.length || 0 }))) : 'null'}`)
            
            // Check if images are available
            if (!config.images || config.images.length === 0) {
              out = {
                success: false,
                error: 'No images found in recent conversation messages or current request. Please upload an image first.',
              }
              toolCalls.push({ name: 'attach_image_to_ticket', input, output: out })
              return out
            }

            const imageIndex = input.image_index ?? 0
            if (imageIndex < 0 || imageIndex >= config.images.length) {
              out = {
                success: false,
                error: `Image index ${imageIndex} is out of range. ${config.images.length} image(s) available (indices 0-${config.images.length - 1}).`,
              }
              toolCalls.push({ name: 'attach_image_to_ticket', input, output: out })
              return out
            }

            const image = config.images[imageIndex]

            // Parse ticket ID
            const ticketNumber = parseTicketNumber(input.ticket_id)
            const normalizedId = String(ticketNumber ?? 0).padStart(4, '0')

            if (!ticketNumber) {
              out = { success: false, error: `Could not parse ticket number from "${input.ticket_id}".` }
              toolCalls.push({ name: 'attach_image_to_ticket', input, output: out })
              return out
            }

            // Get ticket from Supabase
            const repoFullName =
              (typeof config.repoFullName === 'string' && config.repoFullName.trim()
                ? config.repoFullName.trim()
                : typeof config.projectId === 'string' && config.projectId.trim()
                ? config.projectId.trim()
                : '')
            let ticket: any = null
            let ticketError: string | null = null

            if (repoFullName) {
              const { data: row, error } = await supabase
                .from('tickets')
                .select('pk, repo_full_name, display_id')
                .eq('repo_full_name', repoFullName)
                .eq('ticket_number', ticketNumber)
                .maybeSingle()
              if (error) {
                ticketError = error.message
              } else if (row) {
                ticket = row
              }
            }

            // Fallback to legacy lookup by id
            if (!ticket && !ticketError) {
              const { data: legacyRow, error: legacyError } = await supabase
                .from('tickets')
                .select('pk, repo_full_name, display_id')
                .eq('id', normalizedId)
                .maybeSingle()
              if (legacyError) {
                ticketError = legacyError.message
              } else if (legacyRow) {
                ticket = legacyRow
              }
            }

            if (ticketError || !ticket) {
              out = {
                success: false,
                error: ticketError || `Ticket ${normalizedId} not found in Supabase.`,
              }
              toolCalls.push({ name: 'attach_image_to_ticket', input, output: out })
              return out
            }

            const ticketPk = ticket.pk
            const displayId = ticket.display_id || normalizedId

            // Create artifact body with image
            const timestamp = new Date().toISOString()
            const artifactBody = `![${image.filename}](${image.dataUrl})

**Filename:** ${image.filename}
**MIME Type:** ${image.mimeType}
**Uploaded:** ${timestamp}`

            // Create canonical title: "Image for ticket <display_id>"
            const canonicalTitle = `Image for ticket ${displayId}`

            // Check for existing image artifacts (to prevent exact duplicates)
            const { data: existingArtifacts, error: findError } = await supabase
              .from('agent_artifacts')
              .select('artifact_id, body_md')
              .eq('ticket_pk', ticketPk)
              .eq('agent_type', 'implementation')
              .eq('title', canonicalTitle)
              .order('created_at', { ascending: false })

            if (findError) {
              out = {
                success: false,
                error: `Failed to check for existing artifacts: ${findError.message}`,
              }
              toolCalls.push({ name: 'attach_image_to_ticket', input, output: out })
              return out
            }

            // Check if this exact image (same data URL) was already attached
            const existingWithSameImage = (existingArtifacts || []).find((art) =>
              art.body_md?.includes(image.dataUrl)
            )

            if (existingWithSameImage) {
              out = {
                success: false,
                error: `This image has already been attached to ticket ${displayId}. Artifact ID: ${existingWithSameImage.artifact_id}`,
              }
              toolCalls.push({ name: 'attach_image_to_ticket', input, output: out })
              return out
            }

            // Insert new artifact
            const { data: inserted, error: insertError } = await supabase
              .from('agent_artifacts')
              .insert({
                ticket_pk: ticketPk,
                repo_full_name: ticket.repo_full_name || repoFullName || '',
                agent_type: 'implementation',
                title: canonicalTitle,
                body_md: artifactBody,
              })
              .select('artifact_id')
              .single()

            if (insertError) {
              out = {
                success: false,
                error: `Failed to insert artifact: ${insertError.message}`,
              }
              toolCalls.push({ name: 'attach_image_to_ticket', input, output: out })
              return out
            }

            out = {
              success: true,
              artifact_id: inserted.artifact_id,
              ticket_id: displayId,
              image_filename: image.filename,
            }
          } catch (err) {
            out = {
              success: false,
              error: err instanceof Error ? err.message : String(err),
            }
          }
          toolCalls.push({ name: 'attach_image_to_ticket', input, output: out })
          return out
        },
      })
    })()

  const evaluateTicketReadyTool = tool({
    description:
      'Evaluate ticket body against the Ready-to-start checklist (Definition of Ready). Pass body_md from fetch_ticket_content. Returns ready (boolean), missingItems (list), and checklistResults. Always call this before move_ticket_to_column; do not move if not ready.',
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


  const listTicketsByColumnTool =
    hasSupabase &&
    (() => {
      const supabase: SupabaseClient = createClient(
        config.supabaseUrl!.trim(),
        config.supabaseAnonKey!.trim()
      )
      return tool({
        description:
          'List all tickets in a given Kanban column (e.g. "col-qa", "col-todo", "col-unassigned", "col-human-in-the-loop", "col-will-not-implement"). Returns ticket ID, title, and column. Use when the user asks to see tickets in a specific column, or as the first step for bulk move operations (e.g. list Unassigned before moving all to Will Not Implement).',
        parameters: z.object({
          column_id: z
            .string()
            .describe(
              'Kanban column ID (e.g. "col-qa", "col-todo", "col-unassigned", "col-human-in-the-loop", "col-will-not-implement")'
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

  const moveTicketToColumnTool =
    hasSupabase &&
    (() => {
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
            const supabaseUrl = config.supabaseUrl?.trim() || ''
            const supabaseAnonKey = config.supabaseAnonKey?.trim() || ''
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
                supabaseUrl,
                supabaseAnonKey,
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

        const appliesToAgentType = (
          agentTypes: string[],
          alwaysApply: boolean,
          agentType: string
        ): boolean => alwaysApply || agentTypes.includes('all') || agentTypes.includes(agentType)

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

          const mapSupabaseInstruction = (raw: Record<string, unknown>): AgentInstruction => {
            const rawTopicId = typeof raw.topic_id === 'string' ? raw.topic_id.trim() : ''
            const rawFilename = typeof raw.filename === 'string' ? raw.filename.trim() : ''
            const topicIdValue = rawTopicId || rawFilename.replace(/\.mdc$/i, '')
            const filenameValue = rawFilename || `${topicIdValue || 'unknown'}.mdc`
            const topicMeta = raw.topic_metadata as { title?: string; description?: string } | undefined
            const titleValue =
              (typeof raw.title === 'string' ? raw.title.trim() : '') ||
              topicMeta?.title ||
              filenameValue.replace(/\.mdc$/i, '').replace(/-/g, ' ')
            const descriptionValue =
              (typeof raw.description === 'string' ? raw.description.trim() : '') ||
              topicMeta?.description ||
              'No description'
            const contentValue =
              typeof raw.content_md === 'string'
                ? raw.content_md
                : typeof raw.content_body === 'string'
                  ? raw.content_body
                  : ''
            const agentTypesValue = Array.isArray(raw.agent_types)
              ? raw.agent_types.filter((v): v is string => typeof v === 'string')
              : []
            return {
              topicId: topicIdValue,
              filename: filenameValue,
              title: titleValue,
              description: descriptionValue,
              content: contentValue,
              agentTypes: agentTypesValue,
              alwaysApply: raw.always_apply === true,
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

          // Direct Supabase fallback if HAL could not provide data.
          if (
            basicInstructions.length === 0 &&
            additionalTopicCandidates.length === 0 &&
            config.supabaseUrl &&
            config.supabaseAnonKey
          ) {
            const supabase = createClient(config.supabaseUrl.trim(), config.supabaseAnonKey.trim())
            const [basicQuery, situationalQuery] = await Promise.all([
              supabase
                .from('agent_instructions')
                .select('*')
                .eq('repo_full_name', repoFullName)
                .eq('is_basic', true)
                .order('filename'),
              supabase
                .from('agent_instructions')
                .select('*')
                .eq('repo_full_name', repoFullName)
                .eq('is_situational', true)
                .order('filename'),
            ])

            if (!basicQuery.error && Array.isArray(basicQuery.data)) {
              basicInstructions = basicQuery.data
                .map((row) => mapSupabaseInstruction(row as Record<string, unknown>))
                .filter((inst) =>
                  appliesToAgentType(inst.agentTypes, inst.alwaysApply, targetAgentType)
                )
            }
            if (!situationalQuery.error && Array.isArray(situationalQuery.data)) {
              additionalTopicCandidates = situationalQuery.data
                .map((row) => mapSupabaseInstruction(row as Record<string, unknown>))
                .filter((inst) =>
                  appliesToAgentType(inst.agentTypes, inst.alwaysApply, targetAgentType)
                )
            }
          }

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

        // Fallback: Try direct Supabase if HAL API not available
        if (config.supabaseUrl && config.supabaseAnonKey) {
          const supabase = createClient(config.supabaseUrl.trim(), config.supabaseAnonKey.trim())

          const { data, error } = await supabase
            .from('agent_instructions')
            .select('*')
            .eq('repo_full_name', repoFullName)
            .eq('topic_id', topicId)
            .single()

          if (!error && data) {
            const topicMeta = data.topic_metadata || {}
            const result = {
              topicId,
              title: topicMeta.title || data.title || topicId,
              description: topicMeta.description || data.description || 'No description',
              content: data.content_md || data.content_body || '',
            }
            toolCalls.push({ name: 'get_instruction_set', input, output: result })
            return result
          }

          if (error && error.code !== 'PGRST116') {
            // PGRST116 is "not found", other errors are real problems
            return { 
              error: `Error loading instruction from Supabase: ${error.message}` 
            }
          }
        }

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
    ...(listTicketsByColumnTool ? { list_tickets_by_column: listTicketsByColumnTool } : {}),
    ...(moveTicketToColumnTool ? { move_ticket_to_column: moveTicketToColumnTool } : {}),
    ...(listAvailableReposTool ? { list_available_repos: listAvailableReposTool } : {}),
    ...(kanbanMoveTicketToOtherRepoTodoTool
      ? { kanban_move_ticket_to_other_repo_todo: kanbanMoveTicketToOtherRepoTodoTool }
      : {}),
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
                c.name === 'move_ticket_to_column' &&
                typeof c.output === 'object' &&
                c.output !== null &&
                (c.output as { success?: boolean; column_id?: string }).success === true &&
                (c.output as { column_id?: string }).column_id === 'col-todo'
            )
            if (moveCall) {
              const out = moveCall.output as { ticket_id: string; column_id: string; column_name?: string }
              reply = `I moved ticket **${out.ticket_id}** to **To Do**. It should now appear under To Do on the Kanban board.`
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

/**
 * Summarize older conversation turns using the external LLM (OpenAI).
 * HAL is encouraged to use this whenever building a bounded context pack from long
 * history: the LLM produces a short summary so the main PM turn receives summary + recent
 * messages instead of unbounded transcript.
 * Used when full history is in DB and we send summary + last N to the PM model.
 */
