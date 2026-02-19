/**
 * Ticket operation tools for PM agent.
 * Extracted from runPmAgent.ts to improve maintainability.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { tool } from 'ai'
import { z } from 'zod'
import crypto from 'node:crypto'
import {
  normalizeBodyForReady,
  sectionContent,
  normalizeTitleLineInBody,
} from '../../lib/ticketBodyNormalization.js'
import {
  slugFromTitle,
  repoHintPrefix,
  evaluateTicketReady,
  PLACEHOLDER_RE,
} from '../../lib/projectManagerHelpers.js'
// Helper functions moved here to avoid circular dependency
export function isUnknownColumnError(err: unknown): boolean {
  const e = err as { code?: string; message?: string }
  const msg = (e?.message ?? '').toLowerCase()
  return e?.code === '42703' || (msg.includes('column') && msg.includes('does not exist'))
}

export function isUniqueViolation(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  if (err.code === '23505') return true
  const msg = (err.message ?? '').toLowerCase()
  return msg.includes('duplicate key') || msg.includes('unique constraint')
}
import type { PmAgentConfig, ToolCallRecord } from './types.js'

const COL_TODO = 'col-todo'
const MAX_CREATE_TICKET_RETRIES = 10

/**
 * Get the next ticket number for a repository.
 */
async function getNextTicketNumber(
  supabase: SupabaseClient,
  repoFullName: string
): Promise<{ success: true; startNum: number } | { success: false; error: string }> {
  const { data, error } = await supabase
    .from('tickets')
    .select('ticket_number')
    .eq('repo_full_name', repoFullName)
    .order('ticket_number', { ascending: false })
    .limit(1)

  if (error) {
    if (!isUnknownColumnError(error)) {
      return { success: false, error: `Supabase fetch max ticket_number: ${error.message}` }
    }

    // Legacy fallback: max(id) across all tickets
    const { data: existingRows, error: fetchError } = await supabase
      .from('tickets')
      .select('id')
      .order('id', { ascending: true })

    if (fetchError) {
      return { success: false, error: `Supabase fetch ids: ${fetchError.message}` }
    }

    const ids = (existingRows ?? []).map((r) => (r as { id?: string }).id ?? '')
    const numericIds = ids
      .map((id) => {
        const n = parseInt(id, 10)
        return Number.isNaN(n) ? 0 : n
      })
      .filter((n) => n >= 0)
    const startNum = numericIds.length > 0 ? Math.max(...numericIds) + 1 : 1
    return { success: true, startNum }
  }

  const maxN = (data?.[0] as { ticket_number?: number } | undefined)?.ticket_number
  const startNum = typeof maxN === 'number' && Number.isFinite(maxN) ? maxN + 1 : 1
  return { success: true, startNum }
}

/**
 * Store ticket attachments if images are provided.
 */
async function storeTicketAttachments(
  supabase: SupabaseClient,
  config: PmAgentConfig,
  repoFullName: string,
  candidateNum: number,
  id: string
): Promise<void> {
  if (!config.images || config.images.length === 0) {
    return
  }

  try {
    const ticketQuery =
      repoFullName !== 'legacy/unknown' && candidateNum
        ? supabase.from('tickets').select('pk').eq('repo_full_name', repoFullName).eq('ticket_number', candidateNum).single()
        : supabase.from('tickets').select('pk').eq('id', id).single()
    const ticketResult = await ticketQuery

    if (ticketResult.data && (ticketResult.data as any).pk) {
      const ticketPk = (ticketResult.data as any).pk
      const attachments = config.images.map((img) => ({
        ticket_pk: ticketPk,
        ticket_id: id,
        filename: img.filename,
        mime_type: img.mimeType,
        data_url: img.dataUrl,
        file_size: img.dataUrl.length,
      }))
      const { error: attachError } = await supabase.from('ticket_attachments').insert(attachments)
      if (attachError) {
        console.warn(`[create_ticket] Failed to store attachments: ${attachError.message}`)
      }
    } else {
      console.warn(`[create_ticket] Could not fetch ticket pk for attachment storage`)
    }
  } catch (attachErr) {
    console.warn(
      `[create_ticket] Error storing attachments: ${attachErr instanceof Error ? attachErr.message : String(attachErr)}`
    )
  }
}

/**
 * Auto-fix common formatting issues in ticket body.
 */
async function autoFixTicketBody(
  supabase: SupabaseClient,
  finalBodyMd: string,
  repoFullName: string,
  candidateNum: number,
  id: string
): Promise<{ bodyMd: string; autoFixed: boolean; readiness: ReturnType<typeof evaluateTicketReady> }> {
  let bodyMd = finalBodyMd
  let readiness = evaluateTicketReady(bodyMd)
  let autoFixed = false

  if (!readiness.ready) {
    const acSection = sectionContent(bodyMd, 'Acceptance criteria (UI-only)')
    if (acSection && !/-\s*\[\s*\]/.test(acSection) && /^[\s]*[-*+]\s+/m.test(acSection)) {
      const fixedAc = acSection.replace(/^(\s*)[-*+]\s+/gm, '$1- [ ] ')
      const acRegex = new RegExp(`(##\\s+Acceptance criteria \\(UI-only\\)\\s*\\n)([\\s\\S]*?)(?=\\n##\\s*[^\\s#\\n]|$)`)
      const match = bodyMd.match(acRegex)
      if (match) {
        bodyMd = bodyMd.replace(acRegex, `$1${fixedAc}\n`)
        autoFixed = true
        readiness = evaluateTicketReady(bodyMd)

        if (readiness.ready) {
          const updateQ = supabase.from('tickets').update({ body_md: bodyMd })
          const updateResult =
            repoFullName !== 'legacy/unknown' && candidateNum
              ? await updateQ.eq('repo_full_name', repoFullName).eq('ticket_number', candidateNum)
              : await updateQ.eq('id', id)

          if (updateResult.error) {
            bodyMd = finalBodyMd
            readiness = evaluateTicketReady(bodyMd)
            autoFixed = false
          }
        }
      }
    }
  }

  return { bodyMd, autoFixed, readiness }
}

/**
 * Get the next position in the To Do column.
 */
async function getNextTodoPosition(
  supabase: SupabaseClient,
  repoFullName: string
): Promise<{ success: true; position: number } | { success: false; error: string }> {
  const todoQ = supabase.from('tickets').select('kanban_position').eq('kanban_column_id', COL_TODO)
  const todoR =
    repoFullName !== 'legacy/unknown'
      ? await todoQ.eq('repo_full_name', repoFullName).order('kanban_position', { ascending: false }).limit(1)
      : await todoQ.order('kanban_position', { ascending: false }).limit(1)

  if (todoR.error && isUnknownColumnError(todoR.error)) {
    const legacyTodo = await supabase
      .from('tickets')
      .select('kanban_position')
      .eq('kanban_column_id', COL_TODO)
      .order('kanban_position', { ascending: false })
      .limit(1)

    if (legacyTodo.error) {
      return { success: false, error: `Failed to fetch To Do position: ${legacyTodo.error.message}` }
    }

    const max = (legacyTodo.data ?? []).reduce(
      (acc, r) => Math.max(acc, (r as { kanban_position?: number }).kanban_position ?? 0),
      0
    )
    return { success: true, position: max + 1 }
  }

  if (todoR.error) {
    return { success: false, error: `Failed to fetch To Do position: ${todoR.error.message}` }
  }

  const max = (todoR.data ?? []).reduce(
    (acc, r) => Math.max(acc, (r as { kanban_position?: number }).kanban_position ?? 0),
    0
  )
  return { success: true, position: max + 1 }
}

/**
 * Move ticket to To Do column if ready.
 */
async function moveTicketToTodoIfReady(
  supabase: SupabaseClient,
  repoFullName: string,
  candidateNum: number,
  id: string,
  readiness: ReturnType<typeof evaluateTicketReady>
): Promise<{ moved: boolean; error?: string }> {
  if (!readiness.ready) {
    return { moved: false }
  }

  try {
    const positionResult = await getNextTodoPosition(supabase, repoFullName)
    if (!positionResult.success) {
      return { moved: false, error: positionResult.error }
    }

    const now = new Date().toISOString()
    const updateQ = supabase.from('tickets').update({
      kanban_column_id: COL_TODO,
      kanban_position: positionResult.position,
      kanban_moved_at: now,
    })

    const updateResult =
      repoFullName !== 'legacy/unknown' && candidateNum
        ? await updateQ.eq('repo_full_name', repoFullName).eq('ticket_number', candidateNum)
        : await updateQ.eq('id', id)

    if (updateResult.error) {
      return { moved: false, error: `Failed to move to To Do: ${updateResult.error.message}` }
    }

    return { moved: true }
  } catch (moveErr) {
    return { moved: false, error: moveErr instanceof Error ? moveErr.message : String(moveErr) }
  }
}

/**
 * Create the create_ticket tool.
 */
export function createCreateTicketTool(
  config: PmAgentConfig,
  toolCalls: ToolCallRecord[]
): any {
  const hasSupabase =
    typeof config.supabaseUrl === 'string' &&
    config.supabaseUrl.trim() !== '' &&
    typeof config.supabaseAnonKey === 'string' &&
    config.supabaseAnonKey.trim() !== ''

  if (!hasSupabase) {
    return null
  }

  const supabase: SupabaseClient = createClient(config.supabaseUrl!.trim(), config.supabaseAnonKey!.trim())

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
            autoFixed?: boolean
            movedToTodo?: boolean
            moveError?: string
          }
        | { success: false; error: string; detectedPlaceholders?: string[] }

      let out: CreateResult

      try {
        // Validate for unresolved placeholders BEFORE any database operations
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

        // Normalize headings so stored ticket passes Ready-to-start
        bodyMdTrimmed = normalizeBodyForReady(bodyMdTrimmed)

        const repoFullName =
          typeof config.projectId === 'string' && config.projectId.trim() ? config.projectId.trim() : 'legacy/unknown'
        const prefix = repoHintPrefix(repoFullName)

        // Get next ticket number
        const ticketNumResult = await getNextTicketNumber(supabase, repoFullName)
        if (!ticketNumResult.success) {
          out = { success: false, error: ticketNumResult.error }
          toolCalls.push({ name: 'create_ticket', input, output: out })
          return out
        }

        let startNum = ticketNumResult.startNum
        const slug = slugFromTitle(input.title)
        const now = new Date().toISOString()
        let lastInsertError: { code?: string; message?: string } | null = null

        for (let attempt = 1; attempt <= MAX_CREATE_TICKET_RETRIES; attempt++) {
          const candidateNum = startNum + attempt - 1
          const id = String(candidateNum).padStart(4, '0')
          const displayId = `${prefix}-${id}`
          const filename = `${id}-${slug}.md`
          const filePath = `supabase:tickets/${displayId}`

          // Normalize Title line in body_md to include ID prefix
          const normalizedBodyMd = normalizeTitleLineInBody(bodyMdTrimmed, displayId)

          // Re-validate after normalization
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

          // New schema insert. If DB isn't migrated, fall back to legacy insert.
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
            // Store attachments if present
            await storeTicketAttachments(supabase, config, repoFullName, candidateNum, id)

            // Auto-fix: normalize and re-evaluate
            const { autoFixed, readiness } = await autoFixTicketBody(
              supabase,
              normalizedBodyMd,
              repoFullName,
              candidateNum,
              id
            )

            // Auto-move to To Do if ready
            const moveResult = await moveTicketToTodoIfReady(supabase, repoFullName, candidateNum, id, readiness)

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
              ...(moveResult.moved && { movedToTodo: true }),
              ...(moveResult.error && { moveError: moveResult.error }),
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
}
