import type { IncomingMessage, ServerResponse } from 'http'
import { createClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'

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
    // Try multiple lookup strategies to handle different ticket ID formats:
    // - "172" (numeric id)
    // - "0172" (numeric id with leading zeros)
    // - "HAL-0172" (display_id format)
    let ticketFetch: any = null
    
    if (ticketPk) {
      ticketFetch = await supabase.from('tickets').select('pk, repo_full_name, kanban_column_id, kanban_position').eq('pk', ticketPk).maybeSingle()
    } else if (ticketId) {
      // Strategy 1: Try by id field as-is (e.g., "172")
      ticketFetch = await supabase.from('tickets').select('pk, repo_full_name, kanban_column_id, kanban_position').eq('id', ticketId).maybeSingle()
      
      // Strategy 2: If not found, try by display_id (e.g., "HAL-0172")
      if (ticketFetch.error || !ticketFetch.data) {
        ticketFetch = await supabase.from('tickets').select('pk, repo_full_name, kanban_column_id, kanban_position').eq('display_id', ticketId).maybeSingle()
      }
      
      // Strategy 3: If ticketId looks like display_id (e.g., "HAL-0172"), extract numeric part and try by id
      if ((ticketFetch.error || !ticketFetch.data) && /^[A-Z]+-/.test(ticketId)) {
        const numericPart = ticketId.replace(/^[A-Z]+-/, '')
        // Remove leading zeros to get the actual id value (e.g., "0172" -> "172")
        const idValue = numericPart.replace(/^0+/, '') || numericPart
        if (idValue !== ticketId) {
          ticketFetch = await supabase.from('tickets').select('pk, repo_full_name, kanban_column_id, kanban_position').eq('id', idValue).maybeSingle()
        }
      }
      
      // Strategy 4: If ticketId is numeric with leading zeros (e.g., "0172"), try without leading zeros
      if ((ticketFetch.error || !ticketFetch.data) && /^\d+$/.test(ticketId) && ticketId.startsWith('0')) {
        const withoutLeadingZeros = ticketId.replace(/^0+/, '') || ticketId
        if (withoutLeadingZeros !== ticketId) {
          ticketFetch = await supabase.from('tickets').select('pk, repo_full_name, kanban_column_id, kanban_position').eq('id', withoutLeadingZeros).maybeSingle()
        }
      }
    }

    if (ticketFetch.error || !ticketFetch.data) {
      json(res, 200, {
        success: false,
        error: `Ticket ${ticketId || ticketPk} not found.`,
      })
      return
    }

    const ticket = ticketFetch.data
    const repoFullName = (ticket as any).repo_full_name || ''
    const currentColumnId = (ticket as any).kanban_column_id

    // Determine target position
    let targetPosition: number

    // Fetch all tickets in target column (for position calculation)
    const ticketsInColumnQuery = repoFullName
      ? supabase
          .from('tickets')
          .select('pk, kanban_position')
          .eq('kanban_column_id', columnId!)
          .eq('repo_full_name', repoFullName)
          .order('kanban_position', { ascending: true })
      : supabase
          .from('tickets')
          .select('pk, kanban_position')
          .eq('kanban_column_id', columnId!)
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
    const ticketPkToUse = ticketPk || (ticketFetch.data as any)?.pk
    
    if (!ticketPkToUse) {
      json(res, 200, {
        success: false,
        error: 'Could not determine ticket PK for update.',
      })
      return
    }

    // Check for 3rd failure escalation (0195)
    // Only check if moving to col-todo (QA fail) or if already in col-human-in-the-loop (HITL fail)
    const isQaFail = columnId === 'col-todo' && currentColumnId === 'col-qa'
    const isHitlFail = columnId === 'col-todo' && currentColumnId === 'col-human-in-the-loop'
    
    if (isQaFail || isHitlFail) {
      // Fetch artifacts to count failures
      const { data: artifacts } = await supabase
        .from('agent_artifacts')
        .select('agent_type, body_md, created_at')
        .eq('ticket_pk', ticketPkToUse)
        .in('agent_type', ['qa', 'human-in-the-loop'])
        .order('created_at', { ascending: false })

      let qaFailCount = 0
      let hitlFailCount = 0

      if (artifacts) {
        for (const artifact of artifacts) {
          const bodyMd = artifact.body_md || ''
          
          if (artifact.agent_type === 'qa') {
            // QA failures: look for "QA RESULT: FAIL" or "verdict.*fail" patterns
            const isFail = /QA RESULT:\s*FAIL|verdict.*fail|qa.*fail/i.test(bodyMd) && 
                          !/QA RESULT:\s*PASS|verdict.*pass|qa.*pass/i.test(bodyMd)
            if (isFail) {
              qaFailCount++
            }
          } else if (artifact.agent_type === 'human-in-the-loop') {
            // HITL failures: look for "FAIL" verdict or failure indicators
            const isFail = /verdict.*fail|fail.*verdict|This ticket failed/i.test(bodyMd) && 
                          !/verdict.*pass|pass.*verdict/i.test(bodyMd)
            if (isFail) {
              hitlFailCount++
            }
          }
        }
      }

      // If this is a QA fail, increment count (current failure not yet in artifacts)
      if (isQaFail) {
        qaFailCount++
      }
      // If this is a HITL fail, increment count (current failure not yet in artifacts)
      if (isHitlFail) {
        hitlFailCount++
      }

      // Check if this is the 3rd failure
      const isThirdQaFail = isQaFail && qaFailCount >= 3
      const isThirdHitlFail = isHitlFail && hitlFailCount >= 3

      if (isThirdQaFail || isThirdHitlFail) {
        // Escalate to Process Review
        const processReviewColumnId = 'col-process-review'
        
        // Fetch tickets in Process Review column for position
        const { data: processReviewTickets } = await supabase
          .from('tickets')
          .select('pk, kanban_position')
          .eq('kanban_column_id', processReviewColumnId)
          .eq('repo_full_name', repoFullName)
          .order('kanban_position', { ascending: true })

        const processReviewPosition = processReviewTickets && processReviewTickets.length > 0
          ? Math.max(...processReviewTickets.map((t: any) => t.kanban_position ?? -1)) + 1
          : 0

        // Update ticket to Process Review
        const update = await supabase
          .from('tickets')
          .update({
            kanban_column_id: processReviewColumnId,
            kanban_position: processReviewPosition,
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

        // Create suggestion ticket(s) via direct Supabase insert (using same logic as create endpoint)
        try {
          const ticketDisplayId = (ticketFetch.data as any)?.display_id || (ticketFetch.data as any)?.id
          const failureType = isThirdQaFail ? 'QA' : 'HITL'
          const totalFailures = isThirdQaFail ? qaFailCount : hitlFailCount
          
          // Generate suggestion text
          const suggestion = `Improve agent instructions and process documentation to reduce ${failureType} failures. Ticket ${ticketDisplayId} has failed ${failureType} ${totalFailures} times, indicating a systemic issue that should be addressed through process improvements, instruction updates, or template changes.`

          // Determine next ticket number
          const { data: existingRows } = await supabase
            .from('tickets')
            .select('ticket_number')
            .eq('repo_full_name', repoFullName)
            .order('ticket_number', { ascending: false })
            .limit(1)

          const maxNum = existingRows && existingRows.length > 0 
            ? ((existingRows[0] as any).ticket_number ?? 0)
            : 0
          const nextNum = maxNum + 1

          // Generate prefix
          const repo = repoFullName.split('/').pop() ?? repoFullName
          const tokens = repo.toLowerCase().split(/[^a-z0-9]+/g).filter(Boolean)
          let prefix = 'PRJ'
          for (let i = tokens.length - 1; i >= 0; i--) {
            const t = tokens[i]
            if (!/[a-z]/.test(t)) continue
            if (t.length >= 2 && t.length <= 6) {
              prefix = t.toUpperCase()
              break
            }
          }

          const displayId = `${prefix}-${String(nextNum).padStart(4, '0')}`
          const id = String(nextNum)
          const title = suggestion.length > 100 ? `${suggestion.slice(0, 97)}...` : suggestion
          const filename = `${String(nextNum).padStart(4, '0')}-${title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'ticket'}.md`

          const bodyMd = `# Ticket

- **ID**: (auto-assigned)
- **Title**: (auto-assigned)
- **Owner**: Implementation agent
- **Type**: Process
- **Priority**: P2

## Linkage (for tracking)

- **Proposed from**: ${ticketDisplayId} — Process Review (3rd ${failureType} failure escalation)

## Goal (one sentence)

${suggestion}

## Human-verifiable deliverable (UI-only)

Updated agent instructions, rules, templates, or process documentation that implements the improvement described in the Goal above.

## Acceptance criteria (UI-only)

- [ ] Agent instructions/rules updated to address the suggestion
- [ ] Changes are documented and tested
- [ ] Process improvements are reflected in relevant documentation

## Constraints

- Keep changes focused on agent instructions and process, not implementation code
- Ensure changes are backward compatible where possible

## Non-goals

- Implementation code changes
- Feature additions unrelated to process improvement

## Implementation notes (optional)

This ticket was automatically created from Process Review escalation for ticket ${ticketDisplayId} after ${totalFailures} ${failureType} failures. Review the Goal above and implement the appropriate improvement to agent instructions, rules, or process documentation.
`

          // Insert ticket
          const insert = await supabase.from('tickets').insert({
            pk: crypto.randomUUID(),
            repo_full_name: repoFullName,
            ticket_number: nextNum,
            display_id: displayId,
            id,
            filename,
            title: `${displayId} — ${title}`,
            body_md: bodyMd,
            kanban_column_id: 'col-unassigned',
            kanban_position: 0,
            kanban_moved_at: new Date().toISOString(),
          })

          if (!insert.error) {
            json(res, 200, {
              success: true,
              position: processReviewPosition,
              movedAt,
              columnId: processReviewColumnId,
              columnName: columnName || undefined,
              escalated: true,
              failureType,
              failureCount: totalFailures,
              suggestionTicketCreated: true,
              suggestionTicketId: displayId,
            })
            return
          } else {
            console.error('Failed to create suggestion ticket:', insert.error)
          }
        } catch (createErr) {
          // Log error but don't fail the move
          console.error('Failed to create suggestion ticket on escalation:', createErr)
        }

        json(res, 200, {
          success: true,
          position: processReviewPosition,
          movedAt,
          columnId: processReviewColumnId,
          columnName: columnName || undefined,
          escalated: true,
          failureType: isThirdQaFail ? 'QA' : 'HITL',
          failureCount: qaFailCount + hitlFailCount,
          suggestionTicketCreated: false,
        })
        return
      }
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
    json(res, 500, { success: false, error: err instanceof Error ? err.message : String(err) })
  }
}
