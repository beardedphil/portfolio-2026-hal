import { useState, useCallback, useEffect, useRef } from 'react'
import { getSupabaseClient } from '../lib/supabase'
import { buildAgentRunsByTicketPk, pickMoreRelevantRun } from '../lib/agentRuns'
import type { KanbanTicketRow, KanbanColumnRow, KanbanAgentRunRow } from 'portfolio-2026-kanban'
import type { ArtifactRow } from '../types/app'

const KANBAN_POLL_MS = 10_000
const KANBAN_SAFETY_POLL_MS = 15_000
/** Delay before reverting optimistic update on move failure (0790); gives slow HAL API moves time to succeed */
const ROLLBACK_AFTER_FAILURE_MS = 10_000 // 10 seconds - configurable delay before reverting failed moves

export function useKanban(
  supabaseUrl: string | null,
  supabaseAnonKey: string | null,
  connectedProject: string | null,
  options?: {
    processReviewTicketPk?: string | null
    onTicketMovedToProcessReview?: (ticketPk: string) => void
  }
) {
  const [kanbanTickets, setKanbanTickets] = useState<KanbanTicketRow[]>([])
  const [kanbanColumns, setKanbanColumns] = useState<KanbanColumnRow[]>([])
  const [kanbanAgentRunsByTicketPk, setKanbanAgentRunsByTicketPk] = useState<Record<string, KanbanAgentRunRow>>({})
  const [kanbanRealtimeStatus, setKanbanRealtimeStatus] = useState<'connected' | 'disconnected' | 'polling'>('disconnected')
  const [kanbanLastSync, setKanbanLastSync] = useState<Date | null>(null)
  const [kanbanMoveError, setKanbanMoveError] = useState<string | null>(null)
  const lastRealtimeUpdateRef = useRef<number>(0)
  const realtimeSubscriptionsRef = useRef<{ tickets: boolean; agentRuns: boolean }>({ tickets: false, agentRuns: false })
  // Track when each move was initiated to prevent premature rollback on slow API responses (0790)
  const pendingMovesRef = useRef<Map<string, { startTime: number; originalColumnId: string | null; originalPosition: number | null; originalMovedAt: string | null }>>(new Map())

  /** Fetch tickets and columns from Supabase (HAL owns data; passes to KanbanBoard). */
  const fetchKanbanData = useCallback(async (skipIfRecentRealtime = false) => {
    const url = supabaseUrl?.trim() || (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
    const key = supabaseAnonKey?.trim() || (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()
    if (!url || !key || !connectedProject) {
      setKanbanTickets([])
      setKanbanColumns([])
      setKanbanAgentRunsByTicketPk({})
      return
    }
    // Skip polling if realtime is connected and there was a recent update (within 5 seconds)
    // This prevents polling from overwriting realtime updates (0140)
    if (skipIfRecentRealtime && kanbanRealtimeStatus === 'connected') {
      const timeSinceLastRealtimeUpdate = Date.now() - lastRealtimeUpdateRef.current
      if (timeSinceLastRealtimeUpdate < 5000) {
        return
      }
    }
    try {
      const supabase = getSupabaseClient(url, key)
      const { data: ticketRows } = await supabase
        .from('tickets')
        .select('pk, id, repo_full_name, ticket_number, display_id, filename, title, body_md, kanban_column_id, kanban_position, kanban_moved_at, updated_at')
        .eq('repo_full_name', connectedProject)
        .order('ticket_number', { ascending: true })
      const { data: colRows } = await supabase
        .from('kanban_columns')
        .select('id, title, position, created_at, updated_at')
      const { data: runRows } = await supabase
        .from('hal_agent_runs')
        .select('run_id, agent_type, repo_full_name, ticket_pk, ticket_number, display_id, status, current_stage, created_at, updated_at')
        .eq('repo_full_name', connectedProject)
        .order('created_at', { ascending: false })

      setKanbanTickets((ticketRows ?? []) as KanbanTicketRow[])
      const canonicalColumnOrder = [
        'col-unassigned',
        'col-todo',
        'col-doing',
        'col-qa',
        'col-human-in-the-loop',
        'col-process-review',
        'col-done',
        'col-wont-implement',
      ] as const
      const raw = (colRows ?? []) as KanbanColumnRow[]
      const seen = new Set<string>()
      const columns = raw.filter((c) => {
        if (seen.has(c.id)) return false
        seen.add(c.id)
        return true
      })
      const order = canonicalColumnOrder as unknown as string[]
      const sorted = [...columns].sort((a, b) => {
        const ia = order.indexOf(a.id)
        const ib = order.indexOf(b.id)
        if (ia === -1 && ib === -1) return 0
        if (ia === -1) return 1
        if (ib === -1) return -1
        return ia - ib
      })
      const withTitles = sorted.map((c) =>
        c.id === 'col-qa' ? { ...c, title: 'Ready for QA' } : c
      )
      setKanbanColumns(withTitles)
      setKanbanAgentRunsByTicketPk(buildAgentRunsByTicketPk((runRows ?? []) as KanbanAgentRunRow[]))
      // Removed automatic unassigned check (0161) - now only runs via explicit user action
    } catch {
      setKanbanTickets([])
      setKanbanColumns([])
      setKanbanAgentRunsByTicketPk({})
    }
  }, [supabaseUrl, supabaseAnonKey, connectedProject, kanbanRealtimeStatus])

  useEffect(() => {
    fetchKanbanData().then(() => {
      // Update last sync timestamp after successful fetch (0737)
      setKanbanLastSync(new Date())
    })
  }, [fetchKanbanData])

  // Polling fallback: only run when realtime is disconnected (0140)
  // Safety polling: 15s max delay to ensure eventual consistency even if realtime misses events (0737)
  useEffect(() => {
    if (!connectedProject || !supabaseUrl || !supabaseAnonKey) return
    
    // Safety polling: always run every 15s to ensure eventual consistency (0737)
    // This catches agent moves even if realtime subscription misses the event
    const safetyPollId = setInterval(() => {
      fetchKanbanData(true).then(() => {
        setKanbanLastSync(new Date())
      })
    }, KANBAN_SAFETY_POLL_MS)
    
    // Normal polling: only when realtime is not connected (fallback mode)
    // Polling should run when status is 'disconnected' OR 'polling', but not when 'connected'
    let normalPollId: ReturnType<typeof setInterval> | null = null
    if (kanbanRealtimeStatus !== 'connected') {
      normalPollId = setInterval(() => {
        fetchKanbanData(true).then(() => {
          setKanbanLastSync(new Date())
        })
      }, KANBAN_POLL_MS)
    }
    
    return () => {
      clearInterval(safetyPollId)
      if (normalPollId) clearInterval(normalPollId)
    }
  }, [connectedProject, supabaseUrl, supabaseAnonKey, fetchKanbanData, kanbanRealtimeStatus])

  // Supabase Realtime subscriptions for live updates (0140)
  useEffect(() => {
    const url = supabaseUrl?.trim() || (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
    const key = supabaseAnonKey?.trim() || (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()
    if (!url || !key || !connectedProject) {
      setKanbanRealtimeStatus('disconnected')
      return
    }

    const supabase = getSupabaseClient(url, key)
    const subscriptions: Array<{ unsubscribe: () => void }> = []
    realtimeSubscriptionsRef.current = { tickets: false, agentRuns: false }

    // Helper to update connection status based on subscription state
    const updateConnectionStatus = () => {
      const { tickets, agentRuns } = realtimeSubscriptionsRef.current
      if (tickets && agentRuns) {
        setKanbanRealtimeStatus('connected')
      } else if (!tickets && !agentRuns) {
        setKanbanRealtimeStatus('disconnected')
      } else {
        // One subscription failed, fall back to polling
        setKanbanRealtimeStatus('polling')
      }
    }

    // Subscribe to tickets table changes
    const ticketsChannel = supabase
      .channel(`kanban-tickets-${connectedProject}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tickets',
        },
        (payload) => {
          // Filter by repo_full_name in callback since postgres_changes filter may not support column filters
          const ticket = (payload.new || payload.old) as KanbanTicketRow | { pk: string; repo_full_name?: string }
          if (ticket.repo_full_name !== connectedProject) return

          // Track realtime update timestamp to prevent polling from overwriting (0140)
          lastRealtimeUpdateRef.current = Date.now()
          // Update last sync timestamp (0737)
          setKanbanLastSync(new Date())

          if (payload.eventType === 'INSERT' && payload.new) {
            const newTicket = payload.new as KanbanTicketRow
            setKanbanTickets((prev) => {
              // Prevent duplicates by checking if ticket already exists
              if (prev.some((t) => t.pk === newTicket.pk)) return prev
              return [...prev, newTicket].sort((a, b) => (a.ticket_number ?? 0) - (b.ticket_number ?? 0))
            })
          } else if (payload.eventType === 'UPDATE' && payload.new) {
            const updatedTicket = payload.new as KanbanTicketRow
            // If this ticket has a pending move and the realtime update confirms the move succeeded, clear it (0790)
            const pendingMove = pendingMovesRef.current.get(updatedTicket.pk)
            if (pendingMove && 
                updatedTicket.kanban_column_id !== pendingMove.originalColumnId &&
                updatedTicket.kanban_position !== null) {
              // Realtime update confirms the move succeeded - clear pending move (0790)
              pendingMovesRef.current.delete(updatedTicket.pk)
            }
            setKanbanTickets((prev) => {
              // Replace ticket by pk to prevent duplicates
              const filtered = prev.filter((t) => t.pk !== updatedTicket.pk)
              return [...filtered, updatedTicket].sort((a, b) => (a.ticket_number ?? 0) - (b.ticket_number ?? 0))
            })
          } else if (payload.eventType === 'DELETE' && payload.old) {
            const deletedTicket = payload.old as { pk: string }
            setKanbanTickets((prev) => prev.filter((t) => t.pk !== deletedTicket.pk))
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[HAL] Realtime: Subscribed to tickets changes')
          realtimeSubscriptionsRef.current.tickets = true
          updateConnectionStatus()
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[HAL] Realtime: Tickets subscription error, falling back to polling')
          realtimeSubscriptionsRef.current.tickets = false
          updateConnectionStatus()
        }
      })

    subscriptions.push({ unsubscribe: () => ticketsChannel.unsubscribe() })

    // Subscribe to agent runs table changes
    const agentRunsChannel = supabase
      .channel(`kanban-agent-runs-${connectedProject}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'hal_agent_runs',
        },
        (payload) => {
          // Filter by repo_full_name in callback
          const run = (payload.new || payload.old) as KanbanAgentRunRow | { repo_full_name?: string; ticket_pk?: string }
          if (run.repo_full_name !== connectedProject) return

          // Track realtime update timestamp (0140)
          lastRealtimeUpdateRef.current = Date.now()
          // Update last sync timestamp (0737)
          setKanbanLastSync(new Date())

          if (payload.eventType === 'INSERT' && payload.new) {
            const newRun = payload.new as KanbanAgentRunRow
            const ticketPk = newRun.ticket_pk
            if (ticketPk) {
              setKanbanAgentRunsByTicketPk((prev) => {
                const chosen = pickMoreRelevantRun(prev[ticketPk], newRun)
                if (!chosen) return prev
                if (prev[ticketPk]?.run_id === chosen.run_id) return prev
                return { ...prev, [ticketPk]: chosen }
              })
            }
          } else if (payload.eventType === 'UPDATE' && payload.new) {
            const updatedRun = payload.new as KanbanAgentRunRow
            const ticketPk = updatedRun.ticket_pk
            if (ticketPk) {
              setKanbanAgentRunsByTicketPk((prev) => {
                const chosen = pickMoreRelevantRun(prev[ticketPk], updatedRun)
                if (!chosen) return prev
                if (prev[ticketPk]?.run_id === chosen.run_id) return prev
                return { ...prev, [ticketPk]: chosen }
              })
            }
          } else if (payload.eventType === 'DELETE' && payload.old) {
            const deletedRun = payload.old as { ticket_pk?: string; run_id?: string }
            if (deletedRun.ticket_pk) {
              setKanbanAgentRunsByTicketPk((prev) => {
                const next = { ...prev }
                const ticketPk = deletedRun.ticket_pk!
                // Only remove if the deleted run is the one we currently surface.
                if (!deletedRun.run_id || next[ticketPk]?.run_id === deletedRun.run_id) {
                  delete next[ticketPk]
                }
                return next
              })
            }
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[HAL] Realtime: Subscribed to agent runs changes')
          realtimeSubscriptionsRef.current.agentRuns = true
          updateConnectionStatus()
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[HAL] Realtime: Agent runs subscription error, falling back to polling')
          realtimeSubscriptionsRef.current.agentRuns = false
          updateConnectionStatus()
        }
      })

    subscriptions.push({ unsubscribe: () => agentRunsChannel.unsubscribe() })

    return () => {
      subscriptions.forEach((sub) => sub.unsubscribe())
      setKanbanRealtimeStatus('disconnected')
    }
  }, [connectedProject, supabaseUrl, supabaseAnonKey])

  const handleKanbanMoveTicket = useCallback(
    async (ticketPk: string, columnId: string, position?: number) => {
      // Find the ticket to get its current state for optimistic update
      const ticket = kanbanTickets.find((t) => t.pk === ticketPk)
      if (!ticket) {
        setKanbanMoveError('Cannot move ticket: Ticket not found')
        setTimeout(() => setKanbanMoveError(null), 5000)
        return
      }

      // Store original state for rollback on error
      const originalColumnId = ticket.kanban_column_id
      const originalPosition = ticket.kanban_position
      const originalMovedAt = ticket.kanban_moved_at
      const movedAt = new Date().toISOString()
      const moveStartTime = Date.now()

      // Track move start time to prevent premature rollback on slow API responses (0790)
      pendingMovesRef.current.set(ticketPk, {
        startTime: moveStartTime,
        originalColumnId,
        originalPosition,
        originalMovedAt,
      })

      // Optimistically update UI immediately (0790) - ticket appears in destination column instantly
      setKanbanTickets((prev) => {
        const updated = prev.map((t) =>
          t.pk === ticketPk
            ? {
                ...t,
                kanban_column_id: columnId,
                kanban_position: position ?? 0,
                kanban_moved_at: movedAt,
              }
            : t
        )
        return updated.sort((a, b) => (a.ticket_number ?? 0) - (b.ticket_number ?? 0))
      })
      setKanbanMoveError(null) // Clear any previous error

      try {
        // Call server API instead of direct Supabase write (HAL-0769)
        // Server API uses service role key to bypass RLS
        const apiBaseUrl = import.meta.env.VITE_HAL_API_BASE_URL || window.location.origin
        const response = await fetch(`${apiBaseUrl}/api/tickets/move`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticketPk,
            columnId,
            position,
          }),
        })

        const result = await response.json()

        if (!result.success) {
          // Check if this is an RLS error (direct write blocked)
          const errorMsg = result.error || 'Unknown error'
          if (errorMsg.includes('row-level security') || errorMsg.includes('policy') || errorMsg.includes('permission denied')) {
            throw new Error('Direct writes to tickets are blocked. Please use the standard move action in the UI.')
          }
          throw new Error(errorMsg)
        }

        // Move succeeded - remove from pending moves (0790)
        pendingMovesRef.current.delete(ticketPk)

        // Clear Process Review status when moving a ticket to Process Review column
        // (unless it's the ticket currently being reviewed)
        if (columnId === 'col-process-review' && options?.processReviewTicketPk !== ticketPk) {
          options?.onTicketMovedToProcessReview?.(ticketPk)
        }

        // Refresh data to ensure consistency (realtime will also update, but this ensures sync)
        // Use skipIfRecentRealtime to avoid overwriting realtime updates (0140)
        await fetchKanbanData(true)
      } catch (err) {
        // Move failed - wait for rollback delay before reverting to give slow API responses time to succeed (0790)
        const pendingMove = pendingMovesRef.current.get(ticketPk)
        if (!pendingMove) {
          // Move was already confirmed successful, don't revert
          return
        }

        // Wait for rollback delay before reverting optimistic update (0790)
        const timeSinceMoveStart = Date.now() - pendingMove.startTime
        const remainingDelay = Math.max(0, ROLLBACK_AFTER_FAILURE_MS - timeSinceMoveStart)

        await new Promise((resolve) => setTimeout(resolve, remainingDelay))

        // Check again if move was confirmed successful during the delay (0790)
        const stillPending = pendingMovesRef.current.get(ticketPk)
        if (!stillPending || stillPending.startTime !== pendingMove.startTime) {
          // Move was already confirmed successful, don't revert
          return
        }

        // Move still pending after delay - revert optimistic update (0790)
        pendingMovesRef.current.delete(ticketPk)

        setKanbanTickets((prev) => {
          const reverted = prev.map((t) =>
            t.pk === ticketPk
              ? {
                  ...t,
                  kanban_column_id: pendingMove.originalColumnId,
                  kanban_position: pendingMove.originalPosition,
                  kanban_moved_at: pendingMove.originalMovedAt ?? null,
                }
              : t
          )
          return reverted.sort((a, b) => (a.ticket_number ?? 0) - (b.ticket_number ?? 0))
        })

        // Show user-visible error with clear message (0790)
        setKanbanMoveError('Move failed')
        setTimeout(() => setKanbanMoveError(null), 8000) // Auto-clear after 8 seconds
      }
    },
    [fetchKanbanData, kanbanTickets, options]
  )

  const handleKanbanReorderColumn = useCallback(
    async (columnId: string, orderedTicketPks: string[]) => {
      const errors: string[] = []
      try {
        // Call server API instead of direct Supabase write (HAL-0769)
        // Server API uses service role key to bypass RLS
        const apiBaseUrl = import.meta.env.VITE_HAL_API_BASE_URL || window.location.origin
        // Update position for each ticket in the ordered list
        for (let i = 0; i < orderedTicketPks.length; i++) {
          const ticketPk = orderedTicketPks[i]
          const response = await fetch(`${apiBaseUrl}/api/tickets/move`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ticketPk,
              columnId,
              position: i,
            }),
          })

          const result = await response.json()
          if (!result.success) {
            const errorMsg = result.error || 'Unknown error'
            console.error(`Failed to reorder ticket ${ticketPk}:`, errorMsg)
            errors.push(`Ticket ${ticketPk}: ${errorMsg}`)
            // Continue with other tickets even if one fails
          }
        }
        if (errors.length > 0) {
          setKanbanMoveError(`Failed to reorder some tickets: ${errors.join('; ')}`)
          setTimeout(() => setKanbanMoveError(null), 10000) // Show error for 10 seconds
        }
        await fetchKanbanData()
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        console.error('Failed to reorder tickets:', err)
        setKanbanMoveError(`Failed to reorder tickets: ${errorMsg}`)
        setTimeout(() => setKanbanMoveError(null), 10000) // Show error for 10 seconds
        // Refresh data anyway to show current state
        await fetchKanbanData()
      }
    },
    [fetchKanbanData]
  )

  const handleKanbanUpdateTicketBody = useCallback(
    async (ticketPk: string, bodyMd: string) => {
      const url = supabaseUrl?.trim() || (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
      const key = supabaseAnonKey?.trim() || (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()
      if (!url || !key) return
      const supabase = getSupabaseClient(url, key)
      await supabase.from('tickets').update({ body_md: bodyMd }).eq('pk', ticketPk)
      await fetchKanbanData()
    },
    [supabaseUrl, supabaseAnonKey, fetchKanbanData]
  )

  /** Fetch artifacts for a ticket (same Supabase as tickets). Used by Kanban when opening ticket detail. */
  const fetchArtifactsForTicket = useCallback(
    async (ticketPk: string): Promise<ArtifactRow[]> => {
      const url = supabaseUrl?.trim() || (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
      const key = supabaseAnonKey?.trim() || (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()
      if (!url || !key) return []
      const trySyncAndUseResponse = async (): Promise<ArtifactRow[]> => {
        try {
          const syncRes = await fetch('/api/agent-runs/sync-artifacts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ ticketPk }),
          })
          const syncJson = (await syncRes.json().catch(() => ({}))) as { artifacts?: ArtifactRow[] }
          if (Array.isArray(syncJson.artifacts) && syncJson.artifacts.length > 0) return syncJson.artifacts
        } catch (e) {
          console.warn('[HAL] fetchArtifactsForTicket sync:', e)
        }
        return []
      }
      try {
        const supabase = getSupabaseClient(url, key)
        const { data, error } = await supabase
          .from('agent_artifacts')
          .select('artifact_id, ticket_pk, repo_full_name, agent_type, title, body_md, created_at, updated_at')
          .eq('ticket_pk', ticketPk)
          .order('created_at', { ascending: true })
          .order('artifact_id', { ascending: true })
        if (error) {
          console.warn('[HAL] fetchArtifactsForTicket:', error.message)
          return trySyncAndUseResponse()
        }
        let list = (data ?? []) as ArtifactRow[]
        if (list.length === 0) {
          const fromSync = await trySyncAndUseResponse()
          if (fromSync.length > 0) return fromSync
          const { data: data2 } = await supabase
            .from('agent_artifacts')
            .select('artifact_id, ticket_pk, repo_full_name, agent_type, title, body_md, created_at, updated_at')
            .eq('ticket_pk', ticketPk)
            .order('created_at', { ascending: true })
            .order('artifact_id', { ascending: true })
          list = (data2 ?? []) as ArtifactRow[]
        }
        return list
      } catch (e) {
        console.warn('[HAL] fetchArtifactsForTicket:', e)
        return []
      }
    },
    [supabaseUrl, supabaseAnonKey]
  )

  return {
    kanbanTickets,
    setKanbanTickets,
    kanbanColumns,
    setKanbanColumns,
    kanbanAgentRunsByTicketPk,
    setKanbanAgentRunsByTicketPk,
    kanbanRealtimeStatus,
    kanbanLastSync,
    kanbanMoveError,
    setKanbanMoveError,
    fetchKanbanData,
    handleKanbanMoveTicket,
    handleKanbanReorderColumn,
    handleKanbanUpdateTicketBody,
    fetchArtifactsForTicket,
  }
}
