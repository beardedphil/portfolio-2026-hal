import { useCallback } from 'react'

interface UseTicketOperationsParams {
  setAutoMoveDiagnostics: React.Dispatch<React.SetStateAction<Array<{ timestamp: Date; message: string; type: 'error' | 'info' }>>>
}

export function useTicketOperations({
  setAutoMoveDiagnostics,
}: UseTicketOperationsParams) {
  /** Add auto-move diagnostic entry (0061). */
  const addAutoMoveDiagnostic = useCallback(
    (message: string, type: 'error' | 'info' = 'error') => {
      setAutoMoveDiagnostics((prev) => [...prev, { timestamp: new Date(), message, type }])
    },
    [setAutoMoveDiagnostics]
  )

  /** Move ticket to next column via server API (HAL-0769: use server API instead of direct Supabase write). */
  const moveTicketToColumn = useCallback(
    async (
      ticketId: string,
      targetColumnId: string,
      agentType: 'implementation' | 'qa'
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        // Call server API instead of direct Supabase write (HAL-0769)
        // Server API uses service role key to bypass RLS
        const apiBaseUrl = import.meta.env.VITE_HAL_API_BASE_URL || window.location.origin
        const response = await fetch(`${apiBaseUrl}/api/tickets/move`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticketId,
            columnId: targetColumnId,
          }),
        })

        const result = await response.json()

        if (!result.success) {
          // Check if this is an RLS error (direct write blocked)
          const errorMsg = result.error || 'Unknown error'
          let userFriendlyError = errorMsg
          if (errorMsg.includes('row-level security') || errorMsg.includes('policy') || errorMsg.includes('permission denied')) {
            userFriendlyError = 'Direct writes to tickets are blocked. Please use the standard move action in the UI.'
          }
          const error = `Failed to move ticket ${ticketId} to ${targetColumnId}: ${userFriendlyError}`
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
    [addAutoMoveDiagnostic]
  )

  return { moveTicketToColumn, addAutoMoveDiagnostic }
}
