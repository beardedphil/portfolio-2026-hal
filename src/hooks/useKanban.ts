import { useState, useCallback, useRef, useEffect } from 'react'
import { getSupabaseClient } from '../lib/supabase'
import type { KanbanTicketRow, KanbanColumnRow, KanbanAgentRunRow } from 'portfolio-2026-kanban'

export function useKanban(connectedProject: string | null, supabaseUrl: string | null, supabaseAnonKey: string | null) {
  const [kanbanTickets, setKanbanTickets] = useState<KanbanTicketRow[]>([])
  const [kanbanColumns, setKanbanColumns] = useState<KanbanColumnRow[]>([])
  const [kanbanAgentRunsByTicketPk, setKanbanAgentRunsByTicketPk] = useState<Record<string, KanbanAgentRunRow>>({})
  const [kanbanRealtimeStatus, setKanbanRealtimeStatus] = useState<'connected' | 'disconnected' | 'polling'>('disconnected')
  const [kanbanMoveError, setKanbanMoveError] = useState<string | null>(null)
  const lastRealtimeUpdateRef = useRef<number>(0)
  const realtimeSubscriptionsRef = useRef<{ tickets: boolean; agentRuns: boolean }>({ tickets: false, agentRuns: false })

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
      const byPk: Record<string, KanbanAgentRunRow> = {}
      for (const r of (runRows ?? []) as KanbanAgentRunRow[]) {
        if (r.ticket_pk) byPk[r.ticket_pk] = r
      }
      setKanbanAgentRunsByTicketPk(byPk)
    } catch {
      setKanbanTickets([])
      setKanbanColumns([])
      setKanbanAgentRunsByTicketPk({})
    }
  }, [supabaseUrl, supabaseAnonKey, connectedProject, kanbanRealtimeStatus])

  useEffect(() => {
    fetchKanbanData()
  }, [fetchKanbanData])

  // Polling fallback: only run when realtime is disconnected
  const KANBAN_POLL_MS = 10_000
  useEffect(() => {
    if (!connectedProject || !supabaseUrl || !supabaseAnonKey) return
    if (kanbanRealtimeStatus === 'connected') return
    const id = setInterval(() => fetchKanbanData(true), KANBAN_POLL_MS)
    return () => clearInterval(id)
  }, [connectedProject, supabaseUrl, supabaseAnonKey, fetchKanbanData, kanbanRealtimeStatus])

  // Supabase Realtime subscriptions for live updates
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

    const updateConnectionStatus = () => {
      const { tickets, agentRuns } = realtimeSubscriptionsRef.current
      if (tickets && agentRuns) {
        setKanbanRealtimeStatus('connected')
      } else if (!tickets && !agentRuns) {
        setKanbanRealtimeStatus('disconnected')
      } else {
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
          const ticket = (payload.new || payload.old) as KanbanTicketRow | { pk: string; repo_full_name?: string }
          if (ticket.repo_full_name !== connectedProject) return

          lastRealtimeUpdateRef.current = Date.now()

          if (payload.eventType === 'INSERT' && payload.new) {
            const newTicket = payload.new as KanbanTicketRow
            setKanbanTickets((prev) => {
              if (prev.some((t) => t.pk === newTicket.pk)) return prev
              return [...prev, newTicket].sort((a, b) => (a.ticket_number ?? 0) - (b.ticket_number ?? 0))
            })
          } else if (payload.eventType === 'UPDATE' && payload.new) {
            const updatedTicket = payload.new as KanbanTicketRow
            setKanbanTickets((prev) => {
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
          const run = (payload.new || payload.old) as KanbanAgentRunRow | { repo_full_name?: string; ticket_pk?: string }
          if (run.repo_full_name !== connectedProject) return

          lastRealtimeUpdateRef.current = Date.now()

          if (payload.eventType === 'INSERT' && payload.new) {
            const newRun = payload.new as KanbanAgentRunRow
            const ticketPk = newRun.ticket_pk
            if (ticketPk) {
              setKanbanAgentRunsByTicketPk((prev) => ({
                ...prev,
                [ticketPk]: newRun,
              }))
            }
          } else if (payload.eventType === 'UPDATE' && payload.new) {
            const updatedRun = payload.new as KanbanAgentRunRow
            const ticketPk = updatedRun.ticket_pk
            if (ticketPk) {
              setKanbanAgentRunsByTicketPk((prev) => ({
                ...prev,
                [ticketPk]: updatedRun,
              }))
            }
          } else if (payload.eventType === 'DELETE' && payload.old) {
            const deletedRun = payload.old as { ticket_pk?: string }
            if (deletedRun.ticket_pk) {
              setKanbanAgentRunsByTicketPk((prev) => {
                const next = { ...prev }
                delete next[deletedRun.ticket_pk!]
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
      const url = supabaseUrl?.trim() || (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
      const key = supabaseAnonKey?.trim() || (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()
      if (!url || !key) {
        setKanbanMoveError('Cannot move ticket: Supabase credentials not configured')
        setTimeout(() => setKanbanMoveError(null), 5000)
        return
      }

      const ticket = kanbanTickets.find((t) => t.pk === ticketPk)
      if (!ticket) {
        setKanbanMoveError('Cannot move ticket: Ticket not found')
        setTimeout(() => setKanbanMoveError(null), 5000)
        return
      }

      const originalColumnId = ticket.kanban_column_id
      const originalPosition = ticket.kanban_position
      const movedAt = new Date().toISOString()

      // Optimistic update
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
      setKanbanMoveError(null)

      try {
        const supabase = getSupabaseClient(url, key)
        const { error } = await supabase
          .from('tickets')
          .update({
            kanban_column_id: columnId,
            kanban_position: position ?? 0,
            kanban_moved_at: movedAt,
          })
          .eq('pk', ticketPk)

        if (error) {
          throw error
        }

        await fetchKanbanData(true)
      } catch (err) {
        // Revert optimistic update on error
        setKanbanTickets((prev) => {
          const reverted = prev.map((t) =>
            t.pk === ticketPk
              ? {
                  ...t,
                  kanban_column_id: originalColumnId,
                  kanban_position: originalPosition,
                  kanban_moved_at: ticket.kanban_moved_at,
                }
              : t
          )
          return reverted.sort((a, b) => (a.ticket_number ?? 0) - (b.ticket_number ?? 0))
        })

        const errorMsg = err instanceof Error ? err.message : String(err)
        setKanbanMoveError(`Failed to move ticket: ${errorMsg}`)
        setTimeout(() => setKanbanMoveError(null), 8000)
      }
    },
    [supabaseUrl, supabaseAnonKey, fetchKanbanData, kanbanTickets]
  )

  const handleKanbanReorderColumn = useCallback(
    async (_columnId: string, orderedTicketPks: string[]) => {
      const url = supabaseUrl?.trim() || (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
      const key = supabaseAnonKey?.trim() || (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()
      if (!url || !key) return
      const supabase = getSupabaseClient(url, key)
      for (let i = 0; i < orderedTicketPks.length; i++) {
        await supabase.from('tickets').update({ kanban_position: i }).eq('pk', orderedTicketPks[i])
      }
      await fetchKanbanData()
    },
    [supabaseUrl, supabaseAnonKey, fetchKanbanData]
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

  return {
    kanbanTickets,
    setKanbanTickets,
    kanbanColumns,
    kanbanAgentRunsByTicketPk,
    kanbanRealtimeStatus,
    kanbanMoveError,
    fetchKanbanData,
    handleKanbanMoveTicket,
    handleKanbanReorderColumn,
    handleKanbanUpdateTicketBody,
  }
}
