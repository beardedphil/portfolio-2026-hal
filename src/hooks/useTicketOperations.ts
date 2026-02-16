import { useCallback } from 'react'
import { getSupabaseClient } from '../lib/supabase'

interface UseTicketOperationsParams {
  supabaseUrl: string | null
  supabaseAnonKey: string | null
  setAutoMoveDiagnostics: React.Dispatch<React.SetStateAction<Array<{ timestamp: Date; message: string; type: 'error' | 'info' }>>>
}

export function useTicketOperations({
  supabaseUrl,
  supabaseAnonKey,
  setAutoMoveDiagnostics,
}: UseTicketOperationsParams) {
  /** Add auto-move diagnostic entry (0061). */
  const addAutoMoveDiagnostic = useCallback(
    (message: string, type: 'error' | 'info' = 'error') => {
      setAutoMoveDiagnostics((prev) => [...prev, { timestamp: new Date(), message, type }])
    },
    [setAutoMoveDiagnostics]
  )

  /** Move ticket to next column via Supabase (0061). */
  const moveTicketToColumn = useCallback(
    async (
      ticketId: string,
      targetColumnId: string,
      agentType: 'implementation' | 'qa'
    ): Promise<{ success: boolean; error?: string }> => {
      if (!supabaseUrl || !supabaseAnonKey) {
        const error = `Cannot move ticket ${ticketId}: Supabase credentials not available. Connect project folder to enable auto-move.`
        addAutoMoveDiagnostic(error, 'error')
        return { success: false, error }
      }

      try {
        const supabase = getSupabaseClient(supabaseUrl, supabaseAnonKey)

        // Get max position in target column
        const { data: inColumn, error: fetchErr } = await supabase
          .from('tickets')
          .select('kanban_position')
          .eq('kanban_column_id', targetColumnId)
          .order('kanban_position', { ascending: false })
          .limit(1)

        if (fetchErr) {
          const error = `Failed to fetch tickets in target column ${targetColumnId} for ticket ${ticketId}: ${fetchErr.message}`
          addAutoMoveDiagnostic(error, 'error')
          return { success: false, error }
        }

        const nextPosition = inColumn?.length ? (inColumn[0]?.kanban_position ?? -1) + 1 : 0
        const movedAt = new Date().toISOString()

        // Update ticket column
        const { error: updateErr } = await supabase
          .from('tickets')
          .update({
            kanban_column_id: targetColumnId,
            kanban_position: nextPosition,
            kanban_moved_at: movedAt,
          })
          .eq('id', ticketId)

        if (updateErr) {
          const error = `Failed to move ticket ${ticketId} to ${targetColumnId}: ${updateErr.message}`
          addAutoMoveDiagnostic(error, 'error')
          return { success: false, error }
        }

        // Note: sync-tickets is handled by the backend when tickets are moved via the agent endpoints
        // This frontend move is a fallback/automatic move, so we rely on the Kanban board's polling to reflect the change
        const info = `${agentType === 'implementation' ? 'Implementation' : 'QA'} Agent: Moved ticket ${ticketId} to ${targetColumnId}`
        addAutoMoveDiagnostic(info, 'info')
        return { success: true }
      } catch (err) {
        const error = `Failed to move ticket ${ticketId} to ${targetColumnId}: ${err instanceof Error ? err.message : String(err)}`
        addAutoMoveDiagnostic(error, 'error')
        return { success: false, error }
      }
    },
    [supabaseUrl, supabaseAnonKey, addAutoMoveDiagnostic]
  )

  return { moveTicketToColumn, addAutoMoveDiagnostic }
}
