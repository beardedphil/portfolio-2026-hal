import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import {
  getMissingRequiredImplementationArtifacts,
  hasMissingArtifactExplanation,
  type ArtifactRowForCheck,
} from '../artifacts/_shared.js'
import { readJsonBody, json, parseSupabaseCredentials, fetchTicketByPkOrId } from './_shared.js'

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // CORS: Allow cross-origin requests (for scripts calling from different origins)
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
      ticketId?: string
      ticketPk?: string
      columnId?: string
      columnName?: string
      position?: string | number
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    const ticketId = typeof body.ticketId === 'string' ? body.ticketId.trim() || undefined : undefined
    const ticketPk = typeof body.ticketPk === 'string' ? body.ticketPk.trim() || undefined : undefined
    let columnId = typeof body.columnId === 'string' ? body.columnId.trim() || undefined : undefined
    const columnName = typeof body.columnName === 'string' ? body.columnName.trim() || undefined : undefined
    const position = body.position
    // Use credentials from request body if provided, otherwise fall back to server environment variables
    const { supabaseUrl, supabaseAnonKey } = parseSupabaseCredentials(body)

    if (!ticketId && !ticketPk) {
      json(res, 400, {
        success: false,
        error: 'ticketPk (preferred) or ticketId is required.',
      })
      return
    }

    if (!columnId && !columnName) {
      json(res, 400, {
        success: false,
        error: 'columnId or columnName is required.',
      })
      return
    }

    if (!supabaseUrl || !supabaseAnonKey) {
      json(res, 400, {
        success: false,
        error: 'Supabase credentials required (provide in request body or set SUPABASE_URL and SUPABASE_ANON_KEY in server environment).',
      })
      return
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Resolve column name to column ID if needed
    if (!columnId && columnName) {
      const { data: columns, error: colErr } = await supabase
        .from('kanban_columns')
        .select('id, title')
      
      if (colErr) {
        json(res, 200, {
          success: false,
          error: `Failed to fetch columns: ${colErr.message}`,
        })
        return
      }

      const normalizedName = columnName.toLowerCase().trim()
      const matchedColumn = (columns || []).find((col: any) => {
        const normalizedTitle = (col.title || '').toLowerCase().trim()
        return normalizedTitle === normalizedName || 
               (normalizedName === 'todo' && (normalizedTitle === 'to-do' || normalizedTitle === 'todo')) ||
               (normalizedName === 'to do' && (normalizedTitle === 'to-do' || normalizedTitle === 'todo')) ||
               (normalizedName === 'qa' && normalizedTitle.includes('qa')) ||
               (normalizedName === 'ready for qa' && normalizedTitle.includes('qa')) ||
               (normalizedName === 'human in the loop' && normalizedTitle.includes('human'))
      })

      if (!matchedColumn) {
        json(res, 200, {
          success: false,
          error: `Column "${columnName}" not found. Available columns: ${(columns || []).map((c: any) => c.title).join(', ')}`,
        })
        return
      }

      columnId = matchedColumn.id
    }

    // Fetch current ticket to get repo_full_name for scoped queries
    // Try multiple lookup strategies to handle different ticket ID formats
    const ticketFetch = await fetchTicketByPkOrId(supabase, ticketPk, ticketId)

    if (!ticketFetch || ticketFetch.error || !ticketFetch.data) {
      json(res, 200, {
        success: false,
        error: `Ticket ${ticketId || ticketPk} not found.${ticketFetch?.error ? ` Error: ${ticketFetch.error.message}` : ''}`,
      })
      return
    }

    const ticket = ticketFetch.data
    const repoFullName = (ticket as any).repo_full_name || ''
    const currentColumnId = (ticket as any).kanban_column_id
    const resolvedTicketPk = (ticket as any).pk as string

    // Gate: moving to Ready for QA requires all 8 implementation artifacts (substantive)
    // OR a "Missing Artifact Explanation" artifact if artifacts are missing (0200)
    if (columnId === 'col-qa') {
      if (!resolvedTicketPk) {
        json(res, 200, {
          success: false,
          error: 'Cannot move to Ready for QA: ticket PK not found.',
        })
        return
      }

      // Fetch all artifacts (implementation and any other types, including Missing Artifact Explanation)
      const { data: artifactRows, error: artErr } = await supabase
        .from('agent_artifacts')
        .select('title, agent_type, body_md')
        .eq('ticket_pk', resolvedTicketPk)

      if (artErr) {
        json(res, 200, {
          success: false,
          error: `Cannot move to Ready for QA: failed to check artifacts (${artErr.message}).`,
        })
        return
      }

      const artifactsForCheck: ArtifactRowForCheck[] = (artifactRows || []).map((r: any) => ({
        title: r.title,
        agent_type: r.agent_type,
        body_md: r.body_md,
      }))

      // Filter to implementation artifacts for missing check
      const implementationArtifacts = artifactsForCheck.filter((a) => a.agent_type === 'implementation')
      const missingArtifacts = getMissingRequiredImplementationArtifacts(implementationArtifacts)

      if (missingArtifacts.length > 0) {
        // Check if Missing Artifact Explanation exists
        const hasExplanation = hasMissingArtifactExplanation(artifactsForCheck)

        if (!hasExplanation) {
          json(res, 200, {
            success: false,
            error:
              'Cannot move to Ready for QA: missing required implementation artifacts. You must add a "Missing Artifact Explanation" artifact that explains which artifact(s) are missing and why they were intentionally not created.',
            missingArtifacts,
            remedy:
              'Add a "Missing Artifact Explanation" artifact via POST /api/artifacts/insert-implementation with artifactType "missing-artifact-explanation" and title "Missing Artifact Explanation". The artifact body_md must explain which artifact(s) are missing and why they were intentionally not created. Then retry POST /api/tickets/move.',
          })
          return
        }
      }
    }

    // Determine target position
    let targetPosition: number

    // Ensure columnId is defined before using it
    if (!columnId) {
      json(res, 400, {
        success: false,
        error: 'Column ID is required but was not resolved.',
      })
      return
    }

    // Fetch all tickets in target column (for position calculation)
    const ticketsInColumnQuery = repoFullName
      ? supabase
          .from('tickets')
          .select('pk, kanban_position')
          .eq('kanban_column_id', columnId)
          .eq('repo_full_name', repoFullName)
          .order('kanban_position', { ascending: true })
      : supabase
          .from('tickets')
          .select('pk, kanban_position')
          .eq('kanban_column_id', columnId)
          .order('kanban_position', { ascending: true })

    const { data: ticketsInColumn, error: fetchErr } = await ticketsInColumnQuery

    if (fetchErr) {
      json(res, 200, {
        success: false,
        error: `Failed to fetch tickets in target column: ${fetchErr.message}`,
      })
      return
    }

    const isMovingToSameColumn = currentColumnId === columnId
    const ticketsList = (ticketsInColumn || []).filter((t: any) => t.pk !== ticket.pk) // Exclude current ticket
    const maxPosition = ticketsList.length > 0 
      ? Math.max(...ticketsList.map((t: any) => t.kanban_position ?? -1))
      : -1

    if (position === undefined || position === null || position === 'bottom' || position === '') {
      // Default: append to end
      targetPosition = maxPosition + 1
    } else if (position === 'top' || position === 0) {
      // Move to top: shift all others down
      targetPosition = 0
      // Shift all tickets in column down by 1
      for (const t of ticketsList) {
        await supabase
          .from('tickets')
          .update({ kanban_position: ((t.kanban_position ?? -1) + 1) })
          .eq('pk', t.pk)
      }
    } else if (typeof position === 'number' && position >= 0) {
      // Specific index: shift tickets at/after that position
      const targetIndex = Math.floor(position)
      if (targetIndex > ticketsList.length) {
        // Beyond end, just append
        targetPosition = maxPosition + 1
      } else {
        targetPosition = targetIndex
        // Shift tickets at/after target position down by 1
        for (const t of ticketsList.slice(targetIndex)) {
          await supabase
            .from('tickets')
            .update({ kanban_position: ((t.kanban_position ?? -1) + 1) })
            .eq('pk', t.pk)
        }
      }
    } else {
      json(res, 400, {
        success: false,
        error: `Invalid position: ${position}. Must be "top", "bottom", or a non-negative number.`,
      })
      return
    }

    const movedAt = new Date().toISOString()

    // Update the ticket using the pk from the fetched ticket (most reliable)
    // This ensures we update the correct ticket even if it was found via a different lookup strategy
    const ticketPkToUse = ticketPk || resolvedTicketPk
    
    if (!ticketPkToUse) {
      json(res, 200, {
        success: false,
        error: 'Could not determine ticket PK for update.',
      })
      return
    }

    const update = await supabase
      .from('tickets')
      .update({
        kanban_column_id: columnId,
        kanban_position: targetPosition,
        kanban_moved_at: movedAt,
      })
      .eq('pk', ticketPkToUse)

    if (update.error) {
      json(res, 200, {
        success: false,
        error: `Supabase update failed: ${update.error.message}`,
      })
      return
    }

    json(res, 200, {
      success: true,
      position: targetPosition,
      movedAt,
      columnId,
      columnName: columnName || undefined,
    })
  } catch (err) {
    console.error('[api/tickets/move] Error:', err)
    const errorMessage = err instanceof Error ? err.message : String(err)
    const errorStack = err instanceof Error ? err.stack : undefined
    json(res, 500, { 
      success: false, 
      error: errorMessage,
      stack: errorStack,
      details: err instanceof Error ? {
        name: err.name,
        message: err.message,
      } : undefined
    })
    if (!res.headersSent) {
      json(res, 500, { 
        success: false, 
        error: errorMessage,
        stack: process.env.NODE_ENV === 'development' ? errorStack : undefined,
        details: err instanceof Error ? {
          name: err.name,
          message: err.message,
        } : undefined
      })
    }
  }
}
