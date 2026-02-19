import { useCallback, useEffect } from 'react'
import { getSupabaseClient } from '../lib/supabase'
import { getConversationId } from '../lib/conversation-helpers'
import type { Message, Conversation } from '../lib/conversationStorage'

const MESSAGES_PER_PAGE = 50

interface UseMessagePaginationParams {
  connectedProject: string | null
  supabaseUrl: string | null
  supabaseAnonKey: string | null
  conversations: Map<string, Conversation>
  setConversations: React.Dispatch<React.SetStateAction<Map<string, Conversation>>>
  loadingOlderMessages: string | null
  setLoadingOlderMessages: (convId: string | null) => void
  transcriptRef: React.RefObject<HTMLDivElement>
  selectedConversationId: string | null
  selectedChatTarget: string
  agentTypingTarget: string | null
  implAgentRunStatus: string
  qaAgentRunStatus: string
  processReviewAgentRunStatus: string
  implAgentProgress: Array<{ timestamp: Date; message: string }>
  qaAgentProgress: Array<{ timestamp: Date; message: string }>
  processReviewAgentProgress: Array<{ timestamp: Date; message: string }>
  pmChatWidgetOpen: boolean
  messagesEndRef: React.RefObject<HTMLDivElement>
}

export function useMessagePagination({
  connectedProject,
  supabaseUrl,
  supabaseAnonKey,
  conversations,
  setConversations,
  loadingOlderMessages,
  setLoadingOlderMessages,
  transcriptRef,
  selectedConversationId,
  selectedChatTarget,
  agentTypingTarget,
  implAgentRunStatus,
  qaAgentRunStatus,
  processReviewAgentRunStatus,
  implAgentProgress,
  qaAgentProgress,
  processReviewAgentProgress,
  pmChatWidgetOpen,
  messagesEndRef,
}: UseMessagePaginationParams) {
  // Get active messages from selected conversation (0070)
  // For PM, always use default conversation; for Implementation/QA, use selected conversation if modal is open
  const activeMessages = (() => {
    if (selectedChatTarget === 'project-manager') {
      const defaultConvId = getConversationId('project-manager', 1)
      return conversations.has(defaultConvId) ? conversations.get(defaultConvId)!.messages : []
    }
    if (selectedConversationId && conversations.has(selectedConversationId)) {
      return conversations.get(selectedConversationId)!.messages
    }
    return []
  })()

  // PM chat transcript is always PM-only (HAL-0700)
  const pmMessages = (() => {
    const defaultConvId = getConversationId('project-manager', 1)
    return conversations.has(defaultConvId) ? conversations.get(defaultConvId)!.messages : []
  })()
  // Load older messages for a conversation (pagination)
  const loadOlderMessages = useCallback(
    async (conversationId: string) => {
      if (!connectedProject || !supabaseUrl || !supabaseAnonKey) return
      if (loadingOlderMessages === conversationId) return // Already loading

      const conv = conversations.get(conversationId)
      if (!conv || !conv.hasMoreMessages || conv.oldestLoadedSequence === undefined) return

      setLoadingOlderMessages(conversationId)

      try {
        const supabase = getSupabaseClient(supabaseUrl, supabaseAnonKey)
        const { data: rows, error } = await supabase
          .from('hal_conversation_messages')
          .select('agent, role, content, sequence, created_at')
          .eq('project_id', connectedProject)
          .eq('agent', conversationId)
          .lt('sequence', conv.oldestLoadedSequence!)
          .order('sequence', { ascending: false })
          .limit(MESSAGES_PER_PAGE)

        if (error) {
          console.error('[HAL] Failed to load older messages:', error)
          setLoadingOlderMessages(null)
          return
        }

        if (rows && rows.length > 0) {
          const olderMessages: Message[] = rows.reverse().map((row) => ({
            id: row.sequence as number,
            agent: row.role === 'user' ? 'user' : conv.agentRole,
            content: row.content ?? '',
            timestamp: row.created_at ? new Date(row.created_at) : new Date(),
            imageAttachments: undefined,
          }))

          // Preserve scroll position
          const transcript = transcriptRef.current
          const scrollHeightBefore = transcript?.scrollHeight ?? 0
          const scrollTopBefore = transcript?.scrollTop ?? 0

          // Update conversation with older messages prepended
          setConversations((prev) => {
            const next = new Map(prev)
            const existingConv = next.get(conversationId)
            if (!existingConv) return next

            const allMessages = [...olderMessages, ...existingConv.messages].sort((a, b) => a.id - b.id)
            const newOldestSeq = Math.min(...allMessages.map((m) => m.id))
            const hasMore = olderMessages.length >= MESSAGES_PER_PAGE

            next.set(conversationId, {
              ...existingConv,
              messages: allMessages,
              oldestLoadedSequence: newOldestSeq,
              hasMoreMessages: hasMore,
            })
            return next
          })

          // Restore scroll position after messages are added
          requestAnimationFrame(() => {
            if (transcript) {
              const scrollHeightAfter = transcript.scrollHeight
              const scrollDiff = scrollHeightAfter - scrollHeightBefore
              transcript.scrollTop = scrollTopBefore + scrollDiff
            }
          })
        } else {
          // No more messages
          setConversations((prev) => {
            const next = new Map(prev)
            const existingConv = next.get(conversationId)
            if (existingConv) {
              next.set(conversationId, {
                ...existingConv,
                hasMoreMessages: false,
              })
            }
            return next
          })
        }

        setLoadingOlderMessages(null)
      } catch (err) {
        console.error('[HAL] Failed to load older messages:', err)
        setLoadingOlderMessages(null)
      }
    },
    [connectedProject, supabaseUrl, supabaseAnonKey, conversations, loadingOlderMessages, transcriptRef, setConversations, setLoadingOlderMessages]
  )

  // Auto-scroll transcript to bottom when messages or typing indicator change (but not when loading older messages)
  useEffect(() => {
    if (transcriptRef.current && !loadingOlderMessages) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
    }
  }, [
    activeMessages,
    agentTypingTarget,
    selectedConversationId,
    implAgentRunStatus,
    qaAgentRunStatus,
    processReviewAgentRunStatus,
    implAgentProgress,
    qaAgentProgress,
    processReviewAgentProgress,
    loadingOlderMessages,
    transcriptRef,
  ])

  // Auto-scroll PM chat transcript to bottom when widget opens (HAL-0701)
  useEffect(() => {
    if (pmChatWidgetOpen && messagesEndRef.current) {
      // Use requestAnimationFrame to ensure DOM is fully rendered
      requestAnimationFrame(() => {
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollTop = messagesEndRef.current.scrollHeight
        }
      })
    }
  }, [pmChatWidgetOpen, messagesEndRef])

  // Auto-scroll PM chat transcript to bottom when PM messages change (HAL-0701)
  useEffect(() => {
    if (pmChatWidgetOpen && messagesEndRef.current && !loadingOlderMessages) {
      // Use requestAnimationFrame to ensure DOM is fully rendered after message updates
      requestAnimationFrame(() => {
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollTop = messagesEndRef.current.scrollHeight
        }
      })
    }
  }, [pmMessages, pmChatWidgetOpen, agentTypingTarget, loadingOlderMessages, messagesEndRef])

  // Auto-scroll Project Manager chat to bottom when widget opens or when switching to PM chat (HAL-0701)
  useEffect(() => {
    if (pmChatWidgetOpen && selectedChatTarget === 'project-manager' && transcriptRef.current) {
      // Use requestAnimationFrame to ensure DOM has updated and layout is complete
      requestAnimationFrame(() => {
        if (transcriptRef.current) {
          transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
        }
      })
    }
  }, [pmChatWidgetOpen, selectedChatTarget, pmMessages, transcriptRef])

  // Detect scroll to top and load older messages
  useEffect(() => {
    const transcript = transcriptRef.current
    if (!transcript) return

    const handleScroll = () => {
      // Load more when scrolled within 100px of top
      if (transcript.scrollTop < 100) {
        const currentConvId =
          selectedConversationId || (selectedChatTarget === 'project-manager' ? getConversationId('project-manager', 1) : null)
        if (currentConvId) {
          const conv = conversations.get(currentConvId)
          if (conv && conv.hasMoreMessages && loadingOlderMessages !== currentConvId) {
            loadOlderMessages(currentConvId)
          }
        }
      }
    }

    transcript.addEventListener('scroll', handleScroll)
    return () => transcript.removeEventListener('scroll', handleScroll)
    }, [selectedConversationId, selectedChatTarget, conversations, loadOlderMessages, loadingOlderMessages, transcriptRef])

  return { loadOlderMessages, activeMessages, pmMessages }
}
