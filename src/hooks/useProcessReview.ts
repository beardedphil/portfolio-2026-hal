import { useCallback } from 'react'
import { formatTicketId } from '../lib/ticketOperations'
import type { KanbanTicketRow } from 'portfolio-2026-kanban'
import type { ImageAttachment } from '../types/app'
import type { Agent } from '../lib/conversationStorage'

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
  getOrCreateConversation: (agentRole: Agent, conversationId?: string) => string
  addMessage: (
    conversationId: string,
    agent: 'process-review-agent',
    content: string,
    id?: number,
    imageAttachments?: ImageAttachment[],
    promptText?: string
  ) => void
  upsertMessage: (
    conversationId: string,
    agent: 'process-review-agent',
    content: string,
    id: number,
    imageAttachments?: ImageAttachment[],
    promptText?: string
  ) => void
  appendToMessage: (
    conversationId: string,
    agent: 'process-review-agent',
    delta: string,
    id: number,
    imageAttachments?: ImageAttachment[],
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
  setProcessReviewStatus: React.Dispatch<React.SetStateAction<'idle' | 'running' | 'completed' | 'failed'>>
  setProcessReviewTicketPk: (pk: string | null) => void
  setProcessReviewAgentRunStatus: React.Dispatch<React.SetStateAction<string>>
  setProcessReviewAgentError: (error: string | null) => void
  setProcessReviewAgentTicketId: (id: string | null) => void
  setProcessReviewAgentProgress: React.Dispatch<React.SetStateAction<Array<{ timestamp: Date; message: string }>>>
}

export function useProcessReview({
  supabaseUrl,
  supabaseAnonKey,
  getOrCreateConversation,
  addMessage,
  upsertMessage,
  appendToMessage,
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
        const ticketRow = kanbanTickets.find((t) => t.pk === data.ticketPk) as any
        const repoFullName = (ticketRow?.repo_full_name as string | undefined) ?? ''
        const ticketNumber =
          typeof ticketRow?.ticket_number === 'number'
            ? (ticketRow.ticket_number as number)
            : Number.parseInt(String(data.ticketId ?? '').replace(/[^\d]/g, ''), 10)

        if (!repoFullName || !Number.isFinite(ticketNumber)) {
          throw new Error('Process Review requires repo_full_name and ticket_number.')
        }

        addProgress('Launching Process Review (async)...')
        setProcessReviewAgentRunStatus('launching')

        const launchRes = await fetch('/api/agent-runs/launch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            agentType: 'process-review',
            repoFullName,
            ticketNumber,
            defaultBranch: 'main',
          }),
        })
        const launchText = await launchRes.text()
        let launchData: { runId?: string; error?: string }
        try {
          launchData = JSON.parse(launchText) as typeof launchData
        } catch {
          const msg = launchRes.ok
            ? 'Invalid response from server (not JSON).'
            : `Launch failed (${launchRes.status}): ${launchText.slice(0, 200)}`
          throw new Error(msg)
        }
        if (!launchRes.ok || !launchData.runId) {
          throw new Error(launchData.error ?? `Launch failed (HTTP ${launchRes.status})`)
        }

        const runId = launchData.runId
        setProcessReviewAgentRunStatus('running')
        addProgress(`Streaming Process Review output (runId: ${runId.slice(0, 8)}...)`)

        const placeholderId = Date.now()
        upsertMessage(convId, 'process-review-agent', '', placeholderId)

        const es = new EventSource(`/api/agent-runs/stream?runId=${encodeURIComponent(runId)}`)
        let closed = false
        const close = () => {
          if (closed) return
          closed = true
          try { es.close() } catch { /* ignore */ }
        }

        const finish = (suggestions: Array<{ text: string; justification: string }>, summary: string, reviewId: string) => {
          const suggestionCount = suggestions.length
          if (suggestionCount > 0) {
            const recommendations = suggestions.map((s, idx) => ({
              text: s.text,
              justification: s.justification,
              id: `rec-${Date.now()}-${idx}`,
              error: undefined as string | undefined,
              isCreating: false,
            }))
            setProcessReviewRecommendations(recommendations)
            setProcessReviewModalTicketPk(data.ticketPk)
            setProcessReviewModalTicketId(data.ticketId || null)
            setProcessReviewModalReviewId(reviewId)

            setProcessReviewStatus('completed')
            setProcessReviewAgentRunStatus('completed')
            const successMsg = `Process Review completed for ticket ${ticketDisplayId}. ${suggestionCount} recommendation${suggestionCount !== 1 ? 's' : ''} ready for review.`
            addMessage(
              convId,
              'process-review-agent',
              `[Process Review] ✅ ${successMsg}\n\nReview the recommendations in the modal and click "Implement" to create tickets.`
            )
            addProgress('Process Review completed - recommendations modal opened')
          } else {
            setProcessReviewStatus('completed')
            setProcessReviewAgentRunStatus('completed')
            const successMsg = `Process Review completed for ticket ${ticketDisplayId}. No recommendations found.`
            addMessage(convId, 'process-review-agent', `[Process Review] ✅ ${successMsg}`)
            addProgress('Process Review completed - no recommendations found')
            setTimeout(() => {
              setProcessReviewStatus('idle')
              setProcessReviewTicketPk(null)
            }, 5000)
          }
          upsertMessage(convId, 'process-review-agent', summary, placeholderId)
        }

        es.addEventListener('text_delta', (evt) => {
          try {
            const data = JSON.parse((evt as MessageEvent).data) as any
            const delta = String(data?.payload?.text ?? '')
            if (delta) appendToMessage(convId, 'process-review-agent', delta, placeholderId)
          } catch {
            // ignore
          }
        })
        es.addEventListener('progress', (evt) => {
          try {
            const data = JSON.parse((evt as MessageEvent).data) as any
            const msg = String(data?.payload?.message ?? '')
            if (msg) addProgress(msg)
          } catch {
            // ignore
          }
        })
        es.addEventListener('done', (evt) => {
          try {
            const evtData = JSON.parse((evt as MessageEvent).data) as any
            const payload = evtData?.payload ?? {}
            const summary = String(payload.summary ?? '')
            const suggestions = Array.isArray(payload.suggestions) ? (payload.suggestions as any[]) : []
            const normalized = suggestions
              .filter((s) => s && typeof s === 'object')
              .filter((s) => typeof (s as any).text === 'string' && typeof (s as any).justification === 'string')
              .map((s) => ({ text: String((s as any).text).trim(), justification: String((s as any).justification).trim() }))
              .filter((s) => s.text && s.justification)
            const reviewId = `review-${Date.now()}-${data.ticketPk}`
            finish(normalized, summary || '', reviewId)
          } finally {
            close()
          }
        })
        es.addEventListener('error', (evt) => {
          try {
            const dataText = (evt as any)?.data
            if (typeof dataText === 'string' && dataText.trim()) {
              const data = JSON.parse(dataText) as any
              const msg = String(data?.payload?.message ?? 'Process Review failed.')
              setProcessReviewStatus('failed')
              setProcessReviewAgentRunStatus('failed')
              setProcessReviewAgentError(msg)
              addMessage(convId, 'process-review-agent', `[Process Review] ❌ Failed: ${msg}`)
              close()
            }
          } catch {
            // ignore transient disconnects
          }
        })
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
      upsertMessage,
      appendToMessage,
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
