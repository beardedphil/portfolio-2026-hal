import { useCallback } from 'react'
import { getSupabaseClient } from '../lib/supabase'
import { parseConversationId } from '../lib/conversation-helpers'
import { extractTicketId } from '../lib/ticketOperations'
import type { ChatTarget } from '../types/app'
import type { ImageAttachment } from '../types/app'
import type { Message, Conversation } from '../lib/conversationStorage'
import type { KanbanTicketRow } from 'portfolio-2026-kanban'

interface UseAgentRunsParams {
  supabaseUrl: string | null
  supabaseAnonKey: string | null
  connectedProject: string | null
  connectedGithubRepo: { fullName: string; defaultBranch: string } | null
  conversations: Map<string, Conversation>
  agentSequenceRefs: React.MutableRefObject<Map<string, number>>
  pmMaxSequenceRef: React.MutableRefObject<number>
  addMessage: (conversationId: string, agent: Message['agent'], content: string, id?: number, imageAttachments?: ImageAttachment[], promptText?: string) => void
  upsertMessage: (conversationId: string, agent: Message['agent'], content: string, id: number, imageAttachments?: ImageAttachment[], promptText?: string) => void
  appendToMessage: (conversationId: string, agent: Message['agent'], delta: string, id: number, imageAttachments?: ImageAttachment[], promptText?: string) => void
  getDefaultConversationId: (agentRole: string) => string
  setLastAgentError: (error: string | null) => void
  setOpenaiLastError: (error: string | null) => void
  setLastPmOutboundRequest: (request: object | null) => void
  setLastPmToolCalls: (calls: unknown[] | null) => void
  setAgentTypingTarget: (target: ChatTarget | null) => void
  setPersistenceError: (error: string | null) => void
  setImplAgentTicketId: (id: string | null) => void
  setQaAgentTicketId: (id: string | null) => void
  setImplAgentRunId: (id: string | null) => void
  setQaAgentRunId: (id: string | null) => void
  setImplAgentRunStatus: (status: any) => void
  setQaAgentRunStatus: (status: any) => void
  setImplAgentProgress: (progress: any) => void
  setQaAgentProgress: (progress: any) => void
  setImplAgentError: (error: string | null) => void
  setQaAgentError: (error: string | null) => void
  setCursorRunAgentType: (type: string | null) => void
  setOrphanedCompletionSummary: (summary: string | null) => void
  implAgentTicketId: string | null
  qaAgentTicketId: string | null
  kanbanTickets: KanbanTicketRow[]
  handleKanbanMoveTicket: (ticketPk: string, columnId: string, position?: number) => Promise<void>
  fetchKanbanData: () => Promise<void>
}

export function useAgentRuns(params: UseAgentRunsParams) {
  const {
    supabaseUrl,
    supabaseAnonKey,
    connectedProject,
    connectedGithubRepo,
    conversations,
    agentSequenceRefs,
    pmMaxSequenceRef,
    addMessage,
    upsertMessage,
    appendToMessage,
    getDefaultConversationId,
    setLastAgentError,
    setOpenaiLastError,
    setLastPmOutboundRequest,
    setLastPmToolCalls,
    setAgentTypingTarget,
    setPersistenceError,
    implAgentTicketId,
    setImplAgentTicketId,
    setQaAgentTicketId,
    setImplAgentRunId,
    setQaAgentRunId,
    setImplAgentRunStatus,
    setQaAgentRunStatus,
    setImplAgentProgress,
    setQaAgentProgress,
    setImplAgentError,
    setQaAgentError,
    setCursorRunAgentType,
    setOrphanedCompletionSummary,
    kanbanTickets,
    handleKanbanMoveTicket,
    fetchKanbanData,
  } = params

  const triggerAgentRun = useCallback(
    (content: string, target: ChatTarget, imageAttachments?: ImageAttachment[], conversationId?: string) => {
      // Get or create conversation ID (0070)
      const convId = conversationId || getDefaultConversationId(target === 'project-manager' ? 'project-manager' : target)
      const useDb = target === 'project-manager' && supabaseUrl != null && supabaseAnonKey != null && connectedProject != null
      setLastAgentError(null)

      if (target === 'project-manager') {
        setLastAgentError(null)
        setOpenaiLastError(null)
        setLastPmOutboundRequest(null)
        setLastPmToolCalls(null)
        setAgentTypingTarget('project-manager')
        ;(async () => {
          try {
            // Get Supabase creds from state or env (0119: ensure credentials are available)
            const url = supabaseUrl?.trim() || (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
            const key = supabaseAnonKey?.trim() || (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()
            // When PM chat is persisted in Supabase, user/assistant messages use integer sequence IDs.
            // System status/progress messages are ephemeral (not persisted) but must NOT collide with
            // the next integer sequence, or the assistant reply will be de-duped and never render.
            let pmSystemMsgCounter = 0
            const addPmSystemMessage = (text: string) => {
              if (useDb && url && key && connectedProject) {
                const baseSeq = agentSequenceRefs.current.get(convId) ?? 0
                pmSystemMsgCounter += 1
                // Use a small fractional offset so IDs remain ordered but never equal an integer sequence.
                const safeId = baseSeq + pmSystemMsgCounter / 100
                addMessage(convId, 'system', text, safeId)
              } else {
                addMessage(convId, 'system', text)
              }
            }
            
            // Add user message to UI (only once, before DB insert to avoid duplicates)
            if (!useDb || !url || !key || !connectedProject) {
              addMessage(convId, 'user', content, undefined, imageAttachments)
            }

            if (useDb && url && key && connectedProject) {
              const currentMaxSeq = agentSequenceRefs.current.get(convId) ?? 0
              const nextSeq = currentMaxSeq + 1
              const supabase = getSupabaseClient(url, key)
              const { error: insertErr } = await supabase.from('hal_conversation_messages').insert({
                project_id: connectedProject,
                agent: convId, // Use conversation ID (e.g., "project-manager-1") (0124)
                role: 'user',
                content,
                sequence: nextSeq,
                ...(imageAttachments && imageAttachments.length > 0
                  ? {
                      images: imageAttachments.map((img) => ({
                        dataUrl: img.dataUrl,
                        filename: img.filename,
                        mimeType: img.file.type,
                      })),
                    }
                  : {}),
              })
              if (insertErr) {
                setPersistenceError(`DB: ${insertErr.message}`)
                // Message already added above if useDb was false, so only add if useDb was true
                if (useDb) {
                  addMessage(convId, 'user', content, undefined, imageAttachments)
                }
              } else {
                agentSequenceRefs.current.set(convId, nextSeq)
                // Backward compatibility: update pmMaxSequenceRef for PM conversations
                const parsed = parseConversationId(convId)
                if (parsed && parsed.agentRole === 'project-manager' && parsed.instanceNumber === 1) {
                  pmMaxSequenceRef.current = nextSeq
                }
                // Message already added above if useDb was false, so only add if useDb was true
                if (useDb) {
                  addMessage(convId, 'user', content, nextSeq, imageAttachments)
                }
              }
            }

            // PM agent: async run + SSE stream (works past Vercel timeouts)
            addPmSystemMessage('[Status] Launching PM run (async)...')
            const launchRes = await fetch('/api/agent-runs/launch', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                agentType: 'project-manager',
                repoFullName: connectedGithubRepo?.fullName,
                defaultBranch: connectedGithubRepo?.defaultBranch || 'main',
                message: content,
                conversationId: convId,
                projectId: connectedProject,
                images: imageAttachments?.map((img) => ({
                  dataUrl: img.dataUrl,
                  filename: img.filename,
                  mimeType: img.file.type,
                })),
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
              setOpenaiLastError(msg)
              setLastAgentError(msg)
              addMessage(convId, 'project-manager', `[PM] Error: ${msg}`)
              setAgentTypingTarget(null)
              return
            }
            if (!launchRes.ok || !launchData.runId) {
              const msg = launchData.error ?? `Launch failed (HTTP ${launchRes.status})`
              setOpenaiLastError(msg)
              setLastAgentError(msg)
              addMessage(convId, 'project-manager', `[PM] Error: ${msg}`)
              setAgentTypingTarget(null)
              return
            }

            const runId = launchData.runId
            addPmSystemMessage(`[Status] Streaming PM output (runId: ${runId.slice(0, 8)}...)`)

            const assistantId = useDb && url && key && connectedProject
              ? ((agentSequenceRefs.current.get(convId) ?? 0) + 1)
              : Date.now()

            // Create placeholder assistant message that we update in-place as deltas arrive.
            upsertMessage(convId, 'project-manager', '', assistantId)

            const es = new EventSource(`/api/agent-runs/stream?runId=${encodeURIComponent(runId)}`)
            let closed = false
            let statusCheckInFlight = false
            let terminalReceived = false
            const close = () => {
              if (closed) return
              closed = true
              try { es.close() } catch { /* ignore */ }
              setAgentTypingTarget(null)
            }

            const checkStatusAndCloseIfTerminal = async () => {
              if (closed || statusCheckInFlight || terminalReceived) return
              statusCheckInFlight = true
              try {
                const r = await fetch(`/api/agent-runs/status?runId=${encodeURIComponent(runId)}`, {
                  credentials: 'include',
                })
                const text = await r.text()
                let statusJson: any = null
                try {
                  statusJson = JSON.parse(text)
                } catch {
                  return
                }
                const status = String(statusJson?.status ?? '')
                if (status === 'completed' || status === 'finished') {
                  const summary = typeof statusJson?.summary === 'string' ? statusJson.summary : ''
                  if (summary.trim()) upsertMessage(convId, 'project-manager', summary.trim(), assistantId)
                  terminalReceived = true
                  close()
                  return
                }
                if (status === 'failed') {
                  const msg = typeof statusJson?.error === 'string' ? statusJson.error : 'Run failed.'
                  setOpenaiLastError(msg)
                  setLastAgentError(msg)
                  addMessage(convId, 'project-manager', `[PM] Error: ${msg}`)
                  terminalReceived = true
                  close()
                }
              } finally {
                statusCheckInFlight = false
              }
            }

            const finalize = async (finalText: string) => {
              if (terminalReceived) return
              terminalReceived = true
              const reply = finalText.trim()
              upsertMessage(convId, 'project-manager', reply, assistantId)
              setOpenaiLastError(null)
              setLastAgentError(null)
              if (useDb && url && key && connectedProject) {
                const supabase = getSupabaseClient(url, key)
                await supabase.from('hal_conversation_messages').insert({
                  project_id: connectedProject,
                  agent: convId,
                  role: 'assistant',
                  content: reply,
                  sequence: assistantId,
                })
                agentSequenceRefs.current.set(convId, assistantId)
                const parsed = parseConversationId(convId)
                if (parsed?.agentRole === 'project-manager' && parsed.instanceNumber === 1) {
                  pmMaxSequenceRef.current = assistantId
                }
              }
              close()
            }

            es.addEventListener('text_delta', (evt) => {
              if (terminalReceived) return
              try {
                const data = JSON.parse((evt as MessageEvent).data) as any
                const delta = String(data?.payload?.text ?? '')
                if (delta) appendToMessage(convId, 'project-manager', delta, assistantId)
              } catch {
                // ignore parse errors
              }
            })
            es.addEventListener('progress', (evt) => {
              if (terminalReceived) return
              try {
                const data = JSON.parse((evt as MessageEvent).data) as any
                const msg = String(data?.payload?.message ?? '')
                if (msg) addPmSystemMessage(`[Progress] ${msg}`)
              } catch {
                // ignore
              }
            })
            es.addEventListener('stage', (evt) => {
              if (terminalReceived) return
              try {
                const data = JSON.parse((evt as MessageEvent).data) as any
                const stage = String(data?.payload?.stage ?? '')
                if (stage) addPmSystemMessage(`[Stage] ${stage}`)
              } catch {
                // ignore
              }
            })
            es.addEventListener('done', (evt) => {
              if (terminalReceived) return
              try {
                const data = JSON.parse((evt as MessageEvent).data) as any
                const summary = String(data?.payload?.summary ?? '')
                void finalize(summary || '')
              } catch {
                void finalize('')
              }
            })
            es.addEventListener('error', (evt) => {
              // Note: EventSource 'error' fires for disconnects too. The server persists events and
              // EventSource will auto-reconnect with Last-Event-ID, so only surface an error if the run fails.
              if (terminalReceived) return
              try {
                const dataText = (evt as any)?.data
                if (typeof dataText === 'string' && dataText.trim()) {
                  const data = JSON.parse(dataText) as any
                  const msg = String(data?.payload?.message ?? data?.message ?? 'Stream error')
                  setOpenaiLastError(msg)
                  setLastAgentError(msg)
                  addMessage(convId, 'project-manager', `[PM] Error: ${msg}`)
                  terminalReceived = true
                  close()
                  return
                }
              } catch {
                // ignore transient disconnects
              }
              // If the stream disconnected without a terminal event, check status once and close if needed.
              setTimeout(() => void checkStatusAndCloseIfTerminal(), 750)
            })
          } catch (err) {
            setAgentTypingTarget(null)
            const msg = err instanceof Error ? err.message : String(err)
            setOpenaiLastError(msg)
            setLastAgentError(msg)
            addMessage(convId, 'project-manager', `[PM] Error: ${msg}`)
          }
        })()
      } else if (target === 'implementation-agent') {
        const cursorApiConfigured = !!(import.meta.env.VITE_CURSOR_API_KEY as string | undefined)?.trim()
        if (!cursorApiConfigured) {
          addMessage(
            convId,
            'implementation-agent',
            '[Implementation Agent] Cursor API is not configured. Set CURSOR_API_KEY and VITE_CURSOR_API_KEY in .env to enable this agent.'
          )
          return
        }

        const ticketId = extractTicketId(content)
        if (ticketId) setImplAgentTicketId(ticketId)

        // Show run start status with ticket ID
        if (ticketId) {
          addMessage(convId, 'system', `[Status] Starting Implementation run for ticket ${ticketId}...`)
        }

        setAgentTypingTarget('implementation-agent')
        setImplAgentRunStatus('preparing')
        setImplAgentProgress([])
        setImplAgentError(null)
        // Track which agent initiated this run (0067)
        setCursorRunAgentType('implementation-agent')
        setOrphanedCompletionSummary(null)

        ;(async () => {
          const addProgress = (message: string) => {
                 const progressEntry = { timestamp: new Date(), message }
                 setImplAgentProgress((prev: Array<{ timestamp: Date; message: string }>) => [...prev, progressEntry])
            addMessage(convId, 'system', `[Progress] ${message}`)
          }

          try {
            if (!ticketId) {
              setImplAgentRunStatus('failed')
              const msg = 'Say "Implement ticket NNNN" (e.g. Implement ticket 0046).'
              setImplAgentError(msg)
              addMessage(convId, 'implementation-agent', `[Implementation Agent] ${msg}`)
              setTimeout(() => setAgentTypingTarget(null), 500)
              return
            }
            if (!connectedGithubRepo?.fullName) {
              setImplAgentRunStatus('failed')
              const msg = 'No GitHub repo connected. Use "Connect GitHub Repo" first.'
              setImplAgentError(msg)
              addMessage(convId, 'implementation-agent', `[Implementation Agent] ${msg}`)
              setTimeout(() => setAgentTypingTarget(null), 500)
              return
            }

            setImplAgentRunStatus('launching')
            addProgress('Launching cloud agent (async run)...')

            const launchRes = await fetch('/api/agent-runs/launch', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                agentType: 'implementation',
                repoFullName: connectedGithubRepo.fullName,
                ticketNumber: parseInt(ticketId, 10),
                defaultBranch: connectedGithubRepo.defaultBranch || 'main',
              }),
            })
            const implLaunchText = await launchRes.text()
            let launchData: { runId?: string; status?: string; error?: string }
            try {
              launchData = JSON.parse(implLaunchText) as typeof launchData
            } catch {
              const msg = launchRes.ok
                ? 'Invalid response from server (not JSON).'
                : `Launch failed (${launchRes.status}): ${implLaunchText.slice(0, 200)}`
              setImplAgentRunStatus('failed')
              setImplAgentError(msg)
              addMessage(convId, 'implementation-agent', `[Implementation Agent] ${msg}`)
              setTimeout(() => setAgentTypingTarget(null), 500)
              return
            }
            if (!launchRes.ok || !launchData.runId) {
              const msg = launchData.error ?? `Launch failed (HTTP ${launchRes.status})`
              setImplAgentRunStatus('failed')
              setImplAgentError(msg)
              addMessage(convId, 'implementation-agent', `[Implementation Agent] ${msg}`)
              setTimeout(() => setAgentTypingTarget(null), 500)
              return
            }

            setImplAgentRunId(launchData.runId)
            setImplAgentRunStatus('running')
            addProgress(`Run launched. Streaming status (runId: ${launchData.runId.slice(0, 8)}...)`)

            const runId = launchData.runId
            const es = new EventSource(`/api/agent-runs/stream?runId=${encodeURIComponent(runId)}`)
            let closed = false
            const close = () => {
              if (closed) return
              closed = true
              try { es.close() } catch { /* ignore */ }
            }

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
              void (async () => {
                try {
                  const data = JSON.parse((evt as MessageEvent).data) as any
                  const summaryFromEvent = String(data?.payload?.summary ?? '')
                  const prUrlFromEvent = data?.payload?.prUrl ? String(data.payload.prUrl) : ''

                  // Call status once to (a) get canonical summary/pr_url and (b) trigger any server-side finalization.
                  let summary = summaryFromEvent || 'Implementation completed.'
                  let prUrl = prUrlFromEvent
                  try {
                    const r = await fetch(`/api/agent-runs/status?runId=${encodeURIComponent(runId)}`, { credentials: 'include' })
                    const text = await r.text()
                    const parsed = JSON.parse(text) as any
                    if (parsed?.summary) summary = String(parsed.summary)
                    if (parsed?.pr_url) prUrl = String(parsed.pr_url)
                  } catch {
                    // ignore
                  }

                  const full = prUrl ? `${summary}\n\nPull request: ${prUrl}` : summary
                  addProgress('Implementation completed successfully.')
                  addMessage(convId, 'implementation-agent', `**Completion summary**\n\n${full}`)

                  setImplAgentRunStatus('completed')
                  setImplAgentRunId(null)

                  const ticketIdForMove = implAgentTicketId
                  let ticketPkForSync: string | null = null
                  if (ticketIdForMove) {
                    const ticket = kanbanTickets.find(
                      (t) =>
                        (t.display_id ?? String(t.ticket_number ?? t.id).padStart(4, '0')) === ticketIdForMove ||
                        t.pk === ticketIdForMove
                    )
                    if (ticket) ticketPkForSync = ticket.pk
                    if (ticket?.kanban_column_id === 'col-doing') {
                      const qaCount = kanbanTickets.filter((t) => t.kanban_column_id === 'col-qa').length
                      handleKanbanMoveTicket(ticket.pk, 'col-qa', qaCount).catch(() => {})
                    }
                  }

                  setImplAgentTicketId(null)
                  setCursorRunAgentType(null)
                  setAgentTypingTarget(null)

                  if (ticketPkForSync) {
                    fetch('/api/agent-runs/sync-artifacts', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      credentials: 'include',
                      body: JSON.stringify({ ticketPk: ticketPkForSync }),
                    })
                      .catch(() => {})
                      .finally(() => fetchKanbanData().catch(() => {}))
                  } else {
                    fetchKanbanData().catch(() => {})
                  }
                } finally {
                  close()
                }
              })()
            })

            es.addEventListener('error', (evt) => {
              // Run error events are emitted as SSE event named "error" with a JSON payload.
              try {
                const dataText = (evt as any)?.data
                if (typeof dataText === 'string' && dataText.trim()) {
                  const data = JSON.parse(dataText) as any
                  const msg = String(data?.payload?.message ?? 'Run failed.')
                  setImplAgentRunStatus('failed')
                  setImplAgentError(msg)
                  addProgress(`Failed: ${msg}`)
                  addMessage(convId, 'implementation-agent', `[Implementation Agent] ${msg}`)
                  setAgentTypingTarget(null)
                  close()
                }
              } catch {
                // ignore transient disconnects; EventSource will auto-reconnect.
              }
            })
          } catch (err) {
            setImplAgentRunStatus('failed')
            const msg = err instanceof Error ? err.message : String(err)
            setImplAgentError(msg)
            addMessage(convId, 'implementation-agent', `[Implementation Agent] ${msg}`)
            setTimeout(() => setAgentTypingTarget(null), 500)
          }
        })()
      } else if (target === 'qa-agent') {
        const cursorApiConfigured = !!(import.meta.env.VITE_CURSOR_API_KEY as string | undefined)?.trim()
        if (!cursorApiConfigured) {
          addMessage(
            convId,
            'qa-agent',
            '[QA Agent] Cursor API is not configured. Set CURSOR_API_KEY and VITE_CURSOR_API_KEY in .env to enable this agent.'
          )
          return
        }

        const ticketId = extractTicketId(content)
        if (ticketId) setQaAgentTicketId(ticketId)

        // Show run start status with ticket ID
        if (ticketId) {
          addMessage(convId, 'system', `[Status] Starting QA run for ticket ${ticketId}...`)
        }

        setAgentTypingTarget('qa-agent')
        setQaAgentRunStatus('preparing')
        setQaAgentProgress([])
        setQaAgentError(null)
        // Track which agent initiated this run (0067)
        setCursorRunAgentType('qa-agent')
        setOrphanedCompletionSummary(null)

        ;(async () => {
          const addProgress = (message: string) => {
                 const progressEntry = { timestamp: new Date(), message }
                 setQaAgentProgress((prev: Array<{ timestamp: Date; message: string }>) => [...prev, progressEntry])
            addMessage(convId, 'system', `[Progress] ${message}`)
          }

          try {
            if (!ticketId) {
              setQaAgentRunStatus('failed')
              const msg = 'Say "QA ticket NNNN" (e.g. QA ticket 0046).'
              setQaAgentError(msg)
              addMessage(convId, 'qa-agent', `[QA Agent] ${msg}`)
              setTimeout(() => setAgentTypingTarget(null), 500)
              return
            }
            if (!connectedGithubRepo?.fullName) {
              setQaAgentRunStatus('failed')
              const msg = 'No GitHub repo connected. Use "Connect GitHub Repo" first.'
              setQaAgentError(msg)
              addMessage(convId, 'qa-agent', `[QA Agent] ${msg}`)
              setTimeout(() => setAgentTypingTarget(null), 500)
              return
            }

            setQaAgentRunStatus('launching')
            addProgress('Launching QA agent (async run)...')

            const launchRes = await fetch('/api/agent-runs/launch', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                agentType: 'qa',
                repoFullName: connectedGithubRepo.fullName,
                ticketNumber: parseInt(ticketId, 10),
                defaultBranch: connectedGithubRepo.defaultBranch || 'main',
              }),
            })
            const launchText = await launchRes.text()
            let launchData: { runId?: string; status?: string; error?: string }
            try {
              launchData = JSON.parse(launchText) as typeof launchData
            } catch {
              const msg = launchRes.ok
                ? 'Invalid response from server (not JSON).'
                : `Launch failed (${launchRes.status}): ${launchText.slice(0, 200)}`
              setQaAgentRunStatus('failed')
              setQaAgentError(msg)
              addMessage(convId, 'qa-agent', `[QA Agent] ${msg}`)
              setTimeout(() => setAgentTypingTarget(null), 500)
              return
            }
            if (!launchRes.ok || !launchData.runId) {
              const msg = launchData.error ?? `Launch failed (HTTP ${launchRes.status})`
              setQaAgentRunStatus('failed')
              setQaAgentError(msg)
              addMessage(convId, 'qa-agent', `[QA Agent] ${msg}`)
              setTimeout(() => setAgentTypingTarget(null), 500)
              return
            }

            setQaAgentRunId(launchData.runId)
            setQaAgentRunStatus('reviewing')
            addProgress(`Run launched. Streaming status (runId: ${launchData.runId.slice(0, 8)}...)`)

            const runId = launchData.runId
            const es = new EventSource(`/api/agent-runs/stream?runId=${encodeURIComponent(runId)}`)
            let closed = false
            const close = () => {
              if (closed) return
              closed = true
              try { es.close() } catch { /* ignore */ }
            }

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
              void (async () => {
                try {
                  const data = JSON.parse((evt as MessageEvent).data) as any
                  const summaryFromEvent = String(data?.payload?.summary ?? '')
                  let summary = summaryFromEvent || 'QA completed.'
                  try {
                    const r = await fetch(`/api/agent-runs/status?runId=${encodeURIComponent(runId)}`, { credentials: 'include' })
                    const text = await r.text()
                    const parsed = JSON.parse(text) as any
                    if (parsed?.summary) summary = String(parsed.summary)
                  } catch {
                    // ignore
                  }

                  addProgress('QA completed successfully.')
                  addMessage(convId, 'qa-agent', `**Completion summary**\n\n${summary}`)
                  setQaAgentRunStatus('completed')
                  setQaAgentRunId(null)
                  setQaAgentTicketId(null)
                  setCursorRunAgentType(null)
                  setAgentTypingTarget(null)
                } finally {
                  close()
                }
              })()
            })

            es.addEventListener('error', (evt) => {
              try {
                const dataText = (evt as any)?.data
                if (typeof dataText === 'string' && dataText.trim()) {
                  const data = JSON.parse(dataText) as any
                  const msg = String(data?.payload?.message ?? 'QA run failed.')
                  setQaAgentRunStatus('failed')
                  setQaAgentError(msg)
                  addProgress(`Failed: ${msg}`)
                  addMessage(convId, 'qa-agent', `[QA Agent] ${msg}`)
                  setAgentTypingTarget(null)
                  close()
                }
              } catch {
                // ignore transient disconnects
              }
            })
          } catch (err) {
            setQaAgentRunStatus('failed')
            const msg = err instanceof Error ? err.message : String(err)
            setQaAgentError(msg)
            addMessage(convId, 'qa-agent', `[QA Agent] ${msg}`)
            setTimeout(() => setAgentTypingTarget(null), 500)
          }
        })()
      }
    },
    [
      supabaseUrl,
      supabaseAnonKey,
      connectedProject,
      connectedGithubRepo,
      conversations,
      agentSequenceRefs,
      pmMaxSequenceRef,
      addMessage,
      upsertMessage,
      appendToMessage,
      getDefaultConversationId,
      setLastAgentError,
      setOpenaiLastError,
      setLastPmOutboundRequest,
      setLastPmToolCalls,
      setAgentTypingTarget,
      setPersistenceError,
      setImplAgentTicketId,
      setQaAgentTicketId,
      setImplAgentRunId,
      setQaAgentRunId,
      setImplAgentRunStatus,
      setQaAgentRunStatus,
      setImplAgentProgress,
      setQaAgentProgress,
      setImplAgentError,
      setQaAgentError,
      setCursorRunAgentType,
      setOrphanedCompletionSummary,
      kanbanTickets,
      handleKanbanMoveTicket,
      fetchKanbanData,
    ]
  )

  return { triggerAgentRun }
}
