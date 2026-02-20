import { useCallback } from 'react'
import { parseConversationId } from '../lib/conversation-helpers'
import { extractTicketId } from '../lib/ticketOperations'
import type { Message, Conversation, ImageAttachment } from '../lib/conversationStorage'

interface UseMessageManagementParams {
  conversations: Map<string, Conversation>
  setConversations: React.Dispatch<React.SetStateAction<Map<string, Conversation>>>
  messageIdRef: React.MutableRefObject<number>
  qaAgentTicketId: string | null
  moveTicketToColumn: (ticketId: string, targetColumnId: string, agentType: 'implementation' | 'qa') => Promise<{ success: boolean; error?: string }>
  addAutoMoveDiagnostic: (message: string, type?: 'error' | 'info') => void
}

export function useMessageManagement({
  conversations,
  setConversations,
  messageIdRef,
  qaAgentTicketId,
  moveTicketToColumn,
  addAutoMoveDiagnostic,
}: UseMessageManagementParams) {
  const ensureIntegerCounter = () => {
    if (!Number.isInteger(messageIdRef.current)) {
      messageIdRef.current = Math.floor(messageIdRef.current)
    }
  }

  const addMessage = useCallback(
    (
      conversationId: string,
      agent: Message['agent'],
      content: string,
      id?: number,
      imageAttachments?: ImageAttachment[],
      promptText?: string
    ) => {
      // IMPORTANT:
      // - Persisted messages use integer sequence IDs in Supabase.
      // - Some ephemeral system messages intentionally use fractional IDs (e.g. baseSeq + 0.01)
      //   to preserve ordering without colliding with the next integer sequence.
      // Never allow fractional IDs to update the global integer message counter, or all future
      // generated IDs will become fractional and DB inserts will fail.
      ensureIntegerCounter()

      const hasProvidedId = typeof id === 'number' && Number.isFinite(id)
      const isProvidedIdInteger = hasProvidedId && Number.isInteger(id)
      const isSystemMessage = agent === 'system'

      const nextId =
        hasProvidedId && (isSystemMessage || isProvidedIdInteger)
          ? (id as number)
          : ++messageIdRef.current

      // Only update the counter for integer IDs (and never for fractional system IDs).
      if (!isSystemMessage && Number.isInteger(nextId)) {
        messageIdRef.current = Math.max(messageIdRef.current, nextId)
      }
      setConversations((prev) => {
        const next = new Map(prev)
        let conv = next.get(conversationId)
        // Create conversation if it doesn't exist (0124: fix PM chat clearing on refresh)
        if (!conv) {
          const parsed = parseConversationId(conversationId)
          if (parsed) {
            conv = {
              id: conversationId,
              agentRole: parsed.agentRole,
              instanceNumber: parsed.instanceNumber,
              messages: [],
              createdAt: new Date(),
            }
            next.set(conversationId, conv)
          } else {
            // Legacy format: try to parse as agent role only
            const agentRole = conversationId.split('-')[0] as Message['agent']
            if (
              agentRole === 'project-manager' ||
              agentRole === 'implementation-agent' ||
              agentRole === 'qa-agent' ||
              agentRole === 'process-review-agent'
            ) {
              // Convert legacy format to new format (instance 1)
              const newConvId = `${agentRole}-1`
              conv = next.get(newConvId)
              if (!conv) {
                conv = {
                  id: newConvId,
                  agentRole,
                  instanceNumber: 1,
                  messages: [],
                  createdAt: new Date(),
                }
                next.set(newConvId, conv)
              }
              // Use the new conversation ID for the message
              conversationId = newConvId
            } else {
              // Unknown format, can't create conversation
              return next
            }
          }
        }
        // Deduplication: Check if a message with the same ID already exists (0153: prevent duplicate messages)
        const existingMessageIndex = conv.messages.findIndex((msg) => msg.id === nextId)
        if (existingMessageIndex >= 0) {
          // Message with this ID already exists, skip adding duplicate
          return next
        }
        next.set(conversationId, {
          ...conv,
          messages: [
            ...conv.messages,
            {
              id: nextId,
              agent,
              content,
              timestamp: new Date(),
              imageAttachments,
              ...(promptText && { promptText }),
            },
          ],
        })
        return next
      })
      // Auto-move ticket when QA completion message is detected in QA Agent chat (0061, 0086)
      const parsed = parseConversationId(conversationId)
      if (parsed && parsed.agentRole === 'qa-agent' && agent === 'qa-agent') {
        const isQaCompletion = /qa.*complete|qa.*report|qa.*pass|qa.*fail|verdict.*pass|verdict.*fail|move.*human.*loop|verified.*main|pass.*ok.*merge/i.test(
          content
        )
        if (isQaCompletion) {
          const isPass =
            /pass|ok.*merge|verified.*main|verdict.*pass/i.test(content) &&
            !/fail|verdict.*fail/i.test(content)
          const isFail = /fail|verdict.*fail|qa.*fail/i.test(content) && !/pass|verdict.*pass/i.test(content)

          if (isPass) {
            const currentTicketId = qaAgentTicketId || extractTicketId(content)
            if (currentTicketId) {
              moveTicketToColumn(currentTicketId, 'col-human-in-the-loop', 'qa').catch(() => {
                // Error already logged via addAutoMoveDiagnostic
              })
            } else {
              addAutoMoveDiagnostic(
                `QA Agent completion (PASS): Could not determine ticket ID from message. Auto-move skipped.`,
                'error'
              )
            }
          } else if (isFail) {
            const currentTicketId = qaAgentTicketId || extractTicketId(content)
            if (currentTicketId) {
              moveTicketToColumn(currentTicketId, 'col-todo', 'qa').catch(() => {
                // Error already logged via addAutoMoveDiagnostic
              })
            } else {
              addAutoMoveDiagnostic(
                `QA Agent completion (FAIL): Could not determine ticket ID from message. Auto-move skipped.`,
                'error'
              )
            }
          }
        }
      }
    },
    [conversations, setConversations, messageIdRef, qaAgentTicketId, moveTicketToColumn, addAutoMoveDiagnostic]
  )

  const upsertMessage = useCallback(
    (
      conversationId: string,
      agent: Message['agent'],
      content: string,
      id: number,
      imageAttachments?: ImageAttachment[],
      promptText?: string
    ) => {
      ensureIntegerCounter()
      if (!Number.isFinite(id)) return

      // Keep the global counter monotonic for integer IDs (never for fractional system IDs).
      const isSystemMessage = agent === 'system'
      if (!isSystemMessage && Number.isInteger(id)) {
        messageIdRef.current = Math.max(messageIdRef.current, id)
      }

      setConversations((prev) => {
        const next = new Map(prev)
        let conv = next.get(conversationId)
        if (!conv) {
          const parsed = parseConversationId(conversationId)
          if (parsed) {
            conv = {
              id: conversationId,
              agentRole: parsed.agentRole,
              instanceNumber: parsed.instanceNumber,
              messages: [],
              createdAt: new Date(),
            }
            next.set(conversationId, conv)
          } else {
            return next
          }
        }

        const idx = conv.messages.findIndex((m) => m.id === id)
        const nextMsg = {
          id,
          agent,
          content,
          timestamp: new Date(),
          imageAttachments,
          ...(promptText && { promptText }),
        }

        if (idx >= 0) {
          const updated = conv.messages.slice()
          updated[idx] = { ...updated[idx], ...nextMsg }
          next.set(conversationId, { ...conv, messages: updated })
          return next
        }

        next.set(conversationId, { ...conv, messages: [...conv.messages, nextMsg] })
        return next
      })
    },
    [setConversations, messageIdRef]
  )

  const appendToMessage = useCallback(
    (
      conversationId: string,
      agent: Message['agent'],
      delta: string,
      id: number,
      imageAttachments?: ImageAttachment[],
      promptText?: string
    ) => {
      if (!delta) return
      setConversations((prev) => {
        const next = new Map(prev)
        let conv = next.get(conversationId)
        if (!conv) return next
        const idx = conv.messages.findIndex((m) => m.id === id)
        if (idx < 0) return next
        const updated = conv.messages.slice()
        const existing = updated[idx]
        updated[idx] = {
          ...existing,
          agent,
          content: String(existing.content ?? '') + delta,
          timestamp: new Date(),
          imageAttachments: imageAttachments ?? existing.imageAttachments,
          ...(promptText ? { promptText } : {}),
        }
        next.set(conversationId, { ...conv, messages: updated })
        return next
      })
    },
    [setConversations]
  )

  return { addMessage, upsertMessage, appendToMessage }
}
