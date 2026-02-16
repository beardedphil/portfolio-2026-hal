import { useCallback } from 'react'
import { getSupabaseClient } from '../lib/supabase'
import { formatTicketId } from '../lib/ticketOperations'
import type { KanbanTicketRow } from 'portfolio-2026-kanban'

interface ProcessReviewRecommendation {
  text: string
  justification: string
  id: string
  error?: string
  isCreating?: boolean
}

interface UseProcessReviewParams {
  supabaseUrl: string | null
  supabaseAnonKey: string | null
  getOrCreateConversation: (agentRole: string, conversationId?: string) => string
  addMessage: (
    conversationId: string,
    agent: 'process-review-agent',
    content: string,
    id?: number,
    imageAttachments?: unknown[],
    promptText?: string
  ) => void
  kanbanTickets: KanbanTicketRow[]
  handleKanbanMoveTicket: (ticketPk: string, columnId: string, position?: number) => Promise<void>
  processReviewRecommendations: ProcessReviewRecommendation[] | null
  setProcessReviewRecommendations: React.Dispatch<React.SetStateAction<ProcessReviewRecommendation[] | null>>
  processReviewModalTicketPk: string | null
  processReviewModalTicketId: string | null
  processReviewModalReviewId: string | null
  setProcessReviewModalTicketPk: (pk: string | null) => void
  setProcessReviewModalTicketId: (id: string | null) => void
  setProcessReviewModalReviewId: (id: string | null) => void
  setProcessReviewStatus: (status: 'idle' | 'running' | 'completed' | 'failed') => void
  setProcessReviewTicketPk: (pk: string | null) => void
  setProcessReviewAgentRunStatus: (status: string) => void
  setProcessReviewAgentError: (error: string | null) => void
  setProcessReviewAgentTicketId: (id: string | null) => void
  setProcessReviewAgentProgress: React.Dispatch<React.SetStateAction<Array<{ timestamp: Date; message: string }>>>
}

export function useProcessReview({
  supabaseUrl,
  supabaseAnonKey,
  getOrCreateConversation,
  addMessage,
  kanbanTickets,
  handleKanbanMoveTicket,
  processReviewRecommendations,
  setProcessReviewRecommendations,
  processReviewModalTicketPk,
  processReviewModalTicketId,
  processReviewModalReviewId,
  setProcessReviewModalTicketPk,
  setProcessReviewModalTicketId,
  setProcessReviewModalReviewId,
  setProcessReviewStatus,
  setProcessReviewTicketPk,
  setProcessReviewAgentRunStatus,
  setProcessReviewAgentError,
  setProcessReviewAgentTicketId,
  setProcessReviewAgentProgress,
}: UseProcessReviewParams) {
  /** Process Review button: trigger Process Review agent for top ticket in Process Review column. */
  const handleKanbanProcessReview = useCallback(
    async (data: { ticketPk: string; ticketId?: string }) => {
      if (!data.ticketPk) return

      // Get or create Process Review conversation
      const convId = getOrCreateConversation('process-review-agent')
      // Keep Process Review flow internal; do not switch PM chat UI context (HAL-0700)

      // Move ticket to Active Work (col-doing) when Process Review starts (0167)
      const doingCount = kanbanTickets.filter((t) => t.kanban_column_id === 'col-doing').length
      try {
        await handleKanbanMoveTicket(data.ticketPk, 'col-doing', doingCount)
      } catch (moveErr) {
        console.error('[HAL] Failed to move ticket to Active Work for Process Review:', moveErr)
      }

      setProcessReviewStatus('running')
      setProcessReviewTicketPk(data.ticketPk)
      setProcessReviewAgentRunStatus('preparing')
      setProcessReviewAgentError(null)

      const ticketDisplayId = formatTicketId(data.ticketId || null)
      addMessage(convId, 'process-review-agent', `[Process Review] Starting review for ticket ${ticketDisplayId}...`)

      const addProgress = (message: string) => {
        addMessage(convId, 'process-review-agent', `[Progress] ${message}`)
      }

      try {
        if (!supabaseUrl || !supabaseAnonKey) {
          throw new Error('Supabase credentials not available')
        }

        const supabase = getSupabaseClient(supabaseUrl, supabaseAnonKey)

        // Fetch ticket artifacts
        addProgress('Launching Process Review agent (Cursor)...')
        setProcessReviewAgentRunStatus('running')

        const launchRes = await fetch('/api/process-review/launch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticketPk: data.ticketPk,
            ticketId: data.ticketId,
            supabaseUrl: supabaseUrl ?? (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? undefined,
            supabaseAnonKey: supabaseAnonKey ?? (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? undefined,
          }),
        })
        const launchData = (await launchRes.json()) as { success?: boolean; runId?: string; status?: string; error?: string }
        if (!launchData.success || !launchData.runId || launchData.status === 'failed') {
          setProcessReviewStatus('failed')
          setProcessReviewAgentRunStatus('failed')
          const errorMsg = launchData.error || 'Launch failed'
          setProcessReviewAgentError(errorMsg)
          addMessage(convId, 'process-review-agent', `[Process Review] ❌ Failed: ${errorMsg}`)
          return
        }

        addProgress('Process Review agent running. Polling status...')
        let reviewId: string | null = null
        const runId = launchData.runId
        // Use the agent runId as a stable Process Review ID for idempotency and tracking.
        // This ensures tickets are only created when the user clicks "Implement" in the modal.
        reviewId = runId
        let lastStatus: string
        let suggestions: Array<{ text: string; justification: string }> = []
        for (;;) {
          await new Promise((r) => setTimeout(r, 4000))
          const r = await fetch(`/api/agent-runs/status?runId=${encodeURIComponent(runId)}`, { credentials: 'include' })
          const pollData = (await r.json()) as {
            status?: string
            error?: string
            suggestions?: Array<{ text: string; justification: string }>
          }
          lastStatus = String(pollData.status ?? '')
          if (pollData.suggestions) suggestions = pollData.suggestions
          if (lastStatus === 'failed') {
            setProcessReviewStatus('failed')
            setProcessReviewAgentRunStatus('failed')
            const errorMsg = pollData.error || 'Unknown error'
            setProcessReviewAgentError(errorMsg)
            addMessage(convId, 'process-review-agent', `[Process Review] ❌ Failed: ${errorMsg}`)
            return
          }
          if (lastStatus === 'finished') break
        }

        const suggestionCount = suggestions?.length || 0
        if (suggestionCount > 0 && suggestions) {
          const recommendations = suggestions.map((s: { text: string; justification: string }, idx: number) => ({
            text: s.text,
            justification: s.justification,
            id: `rec-${Date.now()}-${idx}`,
            error: undefined as string | undefined,
            isCreating: false,
          }))
          setProcessReviewRecommendations(recommendations)
          setProcessReviewModalTicketPk(data.ticketPk)
          setProcessReviewModalTicketId(data.ticketId || null)
          setProcessReviewModalReviewId(reviewId!)

          setProcessReviewStatus('completed')
          setProcessReviewAgentRunStatus('completed')
          const successMsg = `Process Review completed for ticket ${ticketDisplayId}. ${suggestionCount} recommendation${suggestionCount !== 1 ? 's' : ''} ready for review.`
          addMessage(
            convId,
            'process-review-agent',
            `[Process Review] ✅ ${successMsg}\n\nReview the recommendations in the modal and click "Implement" to create tickets.`
          )

          // Modal auto-opens when recommendations are set (no banner, ticket stays in Active Work)
          addProgress('Process Review completed - recommendations modal opened')
        } else {
          setProcessReviewStatus('completed')
          setProcessReviewAgentRunStatus('completed')
          const successMsg = `Process Review completed for ticket ${ticketDisplayId}. No recommendations found.`
          addMessage(convId, 'process-review-agent', `[Process Review] ✅ ${successMsg}`)

          // Ticket stays in Active Work (no move to Done, no banner)
          addProgress('Process Review completed - no recommendations found')
          setTimeout(() => {
            setProcessReviewStatus('idle')
            setProcessReviewTicketPk(null)
          }, 5000)
        }
      } catch (err) {
        setProcessReviewStatus('failed')
        setProcessReviewAgentRunStatus('failed')
        const errorMsg = err instanceof Error ? err.message : String(err)
        setProcessReviewAgentError(errorMsg)
        addMessage(convId, 'process-review-agent', `[Process Review] ❌ Failed: ${errorMsg}`)
      }
    },
    [
      supabaseUrl,
      supabaseAnonKey,
      getOrCreateConversation,
      formatTicketId,
      addMessage,
      kanbanTickets,
      handleKanbanMoveTicket,
      setProcessReviewStatus,
      setProcessReviewStatus,
      setProcessReviewTicketPk,
      setProcessReviewAgentRunStatus,
      setProcessReviewAgentError,
      setProcessReviewAgentTicketId,
      setProcessReviewAgentProgress,
      setProcessReviewRecommendations,
      setProcessReviewModalTicketPk,
      setProcessReviewModalTicketId,
      setProcessReviewModalReviewId,
    ]
  )

  /** Handle Implement button click for Process Review recommendation (0484). */
  const handleProcessReviewImplement = useCallback(
    async (recommendationId: string) => {
      if (!processReviewRecommendations || !processReviewModalTicketPk || !processReviewModalReviewId) return

      const recommendation = processReviewRecommendations.find((r) => r.id === recommendationId)
      if (!recommendation) return

      // Set loading state
      setProcessReviewRecommendations((prev) =>
        prev ? prev.map((r) => (r.id === recommendationId ? { ...r, isCreating: true, error: undefined } : r)) : null
      )

      try {
        // Helper function to hash suggestion text for idempotency
        const hashSuggestion = async (text: string): Promise<string> => {
          const encoder = new TextEncoder()
          const data = encoder.encode(text)
          const hashBuffer = await crypto.subtle.digest('SHA-256', data)
          const hashArray = Array.from(new Uint8Array(hashBuffer))
          const fullHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
          return fullHash.slice(0, 16)
        }

        const suggestionHash = await hashSuggestion(recommendation.text)

        const createResponse = await fetch('/api/tickets/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourceTicketPk: processReviewModalTicketPk,
            sourceTicketId: processReviewModalTicketId,
            suggestion: recommendation.text,
            reviewId: processReviewModalReviewId,
            suggestionHash: suggestionHash,
            supabaseUrl: supabaseUrl ?? (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? undefined,
            supabaseAnonKey: supabaseAnonKey ?? (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? undefined,
          }),
        })

        const createResult = await createResponse.json()

        if (createResult.success) {
          // Remove recommendation from modal on success and check if all are processed
          setProcessReviewRecommendations((prev) => {
            const remaining = prev?.filter((r) => r.id !== recommendationId) || null

            // If all recommendations are processed, close modal and move ticket to Done
            if (!remaining || remaining.length === 0) {
              // Move ticket to Done asynchronously
              const doneCount = kanbanTickets.filter((t) => t.kanban_column_id === 'col-done').length
              handleKanbanMoveTicket(processReviewModalTicketPk, 'col-done', doneCount).catch((moveError) => {
                console.error('Failed to move ticket to Done:', moveError)
              })
              // Close modal
              setProcessReviewModalTicketPk(null)
              setProcessReviewModalTicketId(null)
              setProcessReviewModalReviewId(null)
              return null
            }

            return remaining
          })
        } else {
          // Show error state for this recommendation
          const errorMsg = createResult.error || 'Unknown error'
          setProcessReviewRecommendations((prev) =>
            prev ? prev.map((r) => (r.id === recommendationId ? { ...r, isCreating: false, error: errorMsg } : r)) : null
          )
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        setProcessReviewRecommendations((prev) =>
          prev ? prev.map((r) => (r.id === recommendationId ? { ...r, isCreating: false, error: errorMsg } : r)) : null
        )
      }
    },
    [
      processReviewRecommendations,
      processReviewModalTicketPk,
      processReviewModalTicketId,
      processReviewModalReviewId,
      supabaseUrl,
      supabaseAnonKey,
      kanbanTickets,
      handleKanbanMoveTicket,
      setProcessReviewRecommendations,
      setProcessReviewModalTicketPk,
      setProcessReviewModalTicketId,
      setProcessReviewModalReviewId,
    ]
  )

  /** Handle Ignore button click for Process Review recommendation (0484). */
  const handleProcessReviewIgnore = useCallback(
    (recommendationId: string) => {
      setProcessReviewRecommendations((prev) => {
        const remaining = prev?.filter((r) => r.id !== recommendationId) || null

        // If all recommendations are processed, close modal
        if (!remaining || remaining.length === 0) {
          setProcessReviewModalTicketPk(null)
          setProcessReviewModalTicketId(null)
          setProcessReviewModalReviewId(null)
          return null
        }

        return remaining
      })
    },
    [setProcessReviewRecommendations, setProcessReviewModalTicketPk, setProcessReviewModalTicketId, setProcessReviewModalReviewId]
  )

  return {
    handleKanbanProcessReview,
    handleProcessReviewImplement,
    handleProcessReviewIgnore,
  }
}
