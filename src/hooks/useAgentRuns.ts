import { useCallback } from 'react'
import { getSupabaseClient } from '../lib/supabase'
import { parseConversationId } from '../lib/conversation-helpers'
import { extractTicketId } from '../lib/ticketOperations'
import type { ChatTarget, ImageAttachment } from '../types/app'
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

            if (!connectedGithubRepo?.fullName) {
              setAgentTypingTarget(null)
              addMessage(convId, 'project-manager', '[PM] Connect a GitHub repo first (Connect GitHub Repo) so the PM agent can use the codebase.')
              return
            }

            addPmSystemMessage('[Status] Launching PM agent (Cursor)...')
            const launchRes = await fetch('/api/pm-agent/launch', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                message: content,
                repoFullName: connectedGithubRepo.fullName,
                defaultBranch: connectedGithubRepo.defaultBranch || 'main',
              }),
            })
            const launchData = (await launchRes.json()) as { runId?: string; status?: string; error?: string }
            if (!launchData.runId || launchData.status === 'failed') {
              setAgentTypingTarget(null)
              const errMsg = launchData.error ?? 'Launch failed'
              setOpenaiLastError(errMsg)
              setLastAgentError(errMsg)
              addMessage(convId, 'project-manager', `[PM] Error: ${errMsg}`)
              return
            }

            const runId = launchData.runId
            addPmSystemMessage('[Progress] PM agent running. Polling status...')
            const poll = async (): Promise<{ done: boolean; reply?: string; error?: string }> => {
              const r = await fetch(`/api/agent-runs/status?runId=${encodeURIComponent(runId)}`, { credentials: 'include' })
              const data = await r.json() as { status?: string; summary?: string; error?: string }
              const s = String(data.status ?? '')
              if (s === 'failed') return { done: true, error: data.error ?? 'Unknown error' }
              if (s === 'finished') return { done: true, reply: data.summary ?? 'Done.' }
              return { done: false }
            }
            for (;;) {
              const result = await poll()
              if (!result.done) {
                await new Promise((r) => setTimeout(r, 4000))
                continue
              }
              setAgentTypingTarget(null)
              setOpenaiLastError(null)
              setLastAgentError(null)
              const reply = result.error ? `[PM] Error: ${result.error}` : (result.reply ?? '')
              if (useDb && url && key && connectedProject) {
                const currentMaxSeq = agentSequenceRefs.current.get(convId) ?? 0
                const nextSeq = currentMaxSeq + 1
                const supabase = getSupabaseClient(url, key)
                await supabase.from('hal_conversation_messages').insert({
                  project_id: connectedProject,
                  agent: convId,
                  role: 'assistant',
                  content: reply,
                  sequence: nextSeq,
                })
                agentSequenceRefs.current.set(convId, nextSeq)
                const parsed = parseConversationId(convId)
                if (parsed?.agentRole === 'project-manager' && parsed.instanceNumber === 1) pmMaxSequenceRef.current = nextSeq
                addMessage(convId, 'project-manager', reply, nextSeq)
              } else {
                addMessage(convId, 'project-manager', reply)
              }
              break
            }
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
            setImplAgentProgress((prev) => [...prev, progressEntry])
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
            setImplAgentRunStatus('polling')
            addProgress(`Run launched. Polling status (runId: ${launchData.runId.slice(0, 8)}...)`)

            const poll = async () => {
              const r = await fetch(`/api/agent-runs/status?runId=${encodeURIComponent(launchData.runId!)}`, {
                credentials: 'include',
              })
              const implStatusText = await r.text()
              let data: { status?: string; current_stage?: string; cursor_status?: string; error?: string; summary?: string; pr_url?: string }
              try {
                data = JSON.parse(implStatusText) as typeof data
              } catch {
                const msg = r.ok
                  ? 'Invalid response when polling status (not JSON).'
                  : `Status check failed (${r.status}): ${implStatusText.slice(0, 200)}`
                setImplAgentRunStatus('failed')
                setImplAgentError(msg)
                addProgress(`Failed: ${msg}`)
                addMessage(convId, 'implementation-agent', `[Implementation Agent] ${msg}`)
                setAgentTypingTarget(null)
                return false
              }
              const s = String(data.status ?? '')
              const currentStage = String(data.current_stage ?? '')
              const cursorStatus = String(data.cursor_status ?? '')
              
              // Map current_stage to implAgentRunStatus (0690)
              if (currentStage && ['preparing', 'fetching_ticket', 'resolving_repo', 'launching', 'running', 'completed', 'failed'].includes(currentStage)) {
                setImplAgentRunStatus(currentStage as any)
              } else if (s === 'polling' && !currentStage) {
                // Fallback: if no current_stage but status is polling, use 'running'
                setImplAgentRunStatus('running')
              }
              
              if (s === 'failed') {
                setImplAgentRunStatus('failed')
                const msg = String(data.error ?? 'Unknown error')
                setImplAgentError(msg)
                addProgress(`Failed: ${msg}`)
                addMessage(convId, 'implementation-agent', `[Implementation Agent] ${msg}`)
                setAgentTypingTarget(null)
                return false
              }
              if (s === 'finished') {
                setImplAgentRunStatus('completed')
                const summary = String(data.summary ?? 'Implementation completed.')
                const prUrl = data.pr_url ? String(data.pr_url) : ''
                const full = prUrl ? `${summary}\n\nPull request: ${prUrl}` : summary
                addProgress('Implementation completed successfully.')
                addMessage(convId, 'implementation-agent', `**Completion summary**\n\n${full}`)
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
                // Backfill artifacts from run (in case poll path didn't write) then refresh board
                if (ticketPkForSync) {
                  fetch('/api/agent-runs/sync-artifacts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ ticketPk: ticketPkForSync }),
                  }).catch(() => {}).finally(() => fetchKanbanData().catch(() => {}))
                } else {
                  fetchKanbanData().catch(() => {})
                }
                return false
              }
              if (cursorStatus) addProgress(`Agent is running (status: ${cursorStatus})...`)
              return true
            }

            // Poll loop (client-side) until terminal state
            for (;;) {
              const keep = await poll()
              if (!keep) break
              await new Promise((r) => setTimeout(r, 4000))
            }
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
            setQaAgentProgress((prev) => [...prev, progressEntry])
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
            setQaAgentRunStatus('polling')
            addProgress(`Run launched. Polling status (runId: ${launchData.runId.slice(0, 8)}...)`)

            const poll = async () => {
              const r = await fetch(`/api/agent-runs/status?runId=${encodeURIComponent(launchData.runId!)}`, {
                credentials: 'include',
              })
              const text = await r.text()
              let data: { status?: string; current_stage?: string; cursor_status?: string; error?: string; summary?: string }
              try {
                data = JSON.parse(text) as typeof data
              } catch {
                const msg = r.ok
                  ? 'Invalid response when polling status (not JSON).'
                  : `Status check failed (${r.status}): ${text.slice(0, 200)}`
                setQaAgentRunStatus('failed')
                setQaAgentError(msg)
                addProgress(`Failed: ${msg}`)
                addMessage(convId, 'qa-agent', `[QA Agent] ${msg}`)
                setAgentTypingTarget(null)
                return false
              }
              const s = String(data.status ?? '')
              const currentStage = String(data.current_stage ?? '')
              const cursorStatus = String(data.cursor_status ?? '')
              
              // Map current_stage to qaAgentRunStatus (0690)
              if (currentStage && ['preparing', 'fetching_ticket', 'fetching_branch', 'launching', 'reviewing', 'completed', 'failed'].includes(currentStage)) {
                setQaAgentRunStatus(currentStage as any)
              } else if (s === 'polling' && !currentStage) {
                // Fallback: if no current_stage but status is polling, use 'reviewing'
                setQaAgentRunStatus('reviewing')
              }
              
              if (s === 'failed') {
                setQaAgentRunStatus('failed')
                const msg = String(data.error ?? 'Unknown error')
                setQaAgentError(msg)
                addProgress(`Failed: ${msg}`)
                addMessage(convId, 'qa-agent', `[QA Agent] ${msg}`)
                setAgentTypingTarget(null)
                return false
              }
              if (s === 'finished') {
                setQaAgentRunStatus('completed')
                const summary = String(data.summary ?? 'QA completed.')
                addProgress('QA completed successfully.')
                addMessage(convId, 'qa-agent', `**Completion summary**\n\n${summary}`)
                setQaAgentRunId(null)
                setQaAgentTicketId(null)
                setCursorRunAgentType(null)
                setAgentTypingTarget(null)
                return false
              }
              if (cursorStatus) addProgress(`QA agent is running (status: ${cursorStatus})...`)
              return true
            }

            for (;;) {
              const keep = await poll()
              if (!keep) break
              await new Promise((r) => setTimeout(r, 4000))
            }
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
