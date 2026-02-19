import { useCallback } from 'react'
import { getSupabaseClient } from '../lib/supabase'
import { loadConversationsFromStorage, type Agent, type Message, type Conversation } from '../lib/conversationStorage'
import { getConversationId, parseConversationId, getNextInstanceNumber } from '../lib/conversation-helpers'

const MESSAGES_PER_PAGE = 50 // Number of messages to load per page

export function useConversations(
  supabaseUrl: string | null,
  supabaseAnonKey: string | null,
  setSupabaseUrl: (url: string) => void,
  setSupabaseAnonKey: (key: string) => void,
  conversations: Map<string, Conversation>,
  setConversations: React.Dispatch<React.SetStateAction<Map<string, Conversation>>>,
  setPersistenceError: (error: string | null) => void,
  setConversationHistoryResetMessage: (message: string | null) => void,
  agentSequenceRefs: React.MutableRefObject<Map<string, number>>,
  pmMaxSequenceRef: React.MutableRefObject<number>,
  messageIdRef: React.MutableRefObject<number>
) {
  const loadConversationsForProject = useCallback(async (projectName: string) => {
    const url = supabaseUrl?.trim() || (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
    const key = supabaseAnonKey?.trim() || (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()

    // If Supabase isn't set yet, use Vercel-provided VITE_ env as default (hosted path)
    if ((!supabaseUrl || !supabaseAnonKey) && url && key) {
      setSupabaseUrl(url)
      setSupabaseAnonKey(key)
    }

    // Load conversations from localStorage first (synchronously) to show them immediately after reconnect (0097: fix empty PM chat)
    // Then load from Supabase asynchronously and merge/overwrite with Supabase data (Supabase takes precedence)
    const loadResult = loadConversationsFromStorage(projectName)
    const restoredConversations = loadResult.conversations || new Map<string, Conversation>()
    // Ensure PM conversation exists even if no messages were loaded (0097: fix empty PM chat after reconnect)
    const pmConvId = getConversationId('project-manager', 1)
    if (!restoredConversations.has(pmConvId)) {
      restoredConversations.set(pmConvId, {
        id: pmConvId,
        agentRole: 'project-manager',
        instanceNumber: 1,
        messages: [],
        createdAt: new Date(),
      })
    }
    // Set conversations immediately from localStorage so they're visible right away
    // App remains usable even if loading failed - we just start with empty conversations
    setConversations(restoredConversations)
    
    // Handle conversation history reset (0549: resilient to corrupted data)
    if (loadResult.wasReset && loadResult.error) {
      setConversationHistoryResetMessage(loadResult.error)
    } else {
      setConversationHistoryResetMessage(null)
    }
    
    // Set persistence error for other errors (non-reset cases)
    if (loadResult.error && !loadResult.wasReset) {
      setPersistenceError(loadResult.error)
    } else if (!loadResult.wasReset) {
      setPersistenceError(null)
    }

    // If Supabase is available, load from Supabase asynchronously and merge/overwrite localStorage data
    if (url && key) {
      ;(async () => {
        try {
          const supabase = getSupabaseClient(url, key)
          // Load ALL conversations from Supabase (not just PM) (0124)
          // Load only the most recent messages per conversation for initial load (pagination)
          // Get distinct agents first
          const { data: agentRows } = await supabase
            .from('hal_conversation_messages')
            .select('agent')
            .eq('project_id', projectName)
            .order('agent', { ascending: true })
          
          const uniqueAgents = [...new Set((agentRows || []).map(r => r.agent as string))]
          
          // For each agent, load only the most recent MESSAGES_PER_PAGE messages
          const allRows: Array<{ agent: string; role: string; content: string; sequence: number; created_at: string }> = []
          for (const agentId of uniqueAgents) {
            const { data: agentMessages, error: agentError } = await supabase
              .from('hal_conversation_messages')
              .select('agent, role, content, sequence, created_at')
              .eq('project_id', projectName)
              .eq('agent', agentId)
              .order('sequence', { ascending: false })
              .limit(MESSAGES_PER_PAGE)
            
            if (!agentError && agentMessages) {
              // Reverse to get chronological order (oldest to newest)
              allRows.push(...agentMessages.reverse())
            }
          }
          
          const rows = allRows
          const error = null // We handle errors per agent above
          
          if (error) {
            console.error('[HAL] Failed to load conversations from Supabase:', error)
            // Keep localStorage conversations (already set above)
            return
          }

          // Group messages by agent (conversation ID format: "agent-role-instanceNumber")
          const conversationsByAgent = new Map<string, { messages: Message[]; createdAt: Date }>()
          let maxMessageId = 0

          if (rows && rows.length > 0) {
            for (const row of rows) {
              const agentId = row.agent as string // e.g., "project-manager-1", "implementation-agent-2"
              const parsed = parseConversationId(agentId)
              
              if (!parsed) {
                // Legacy format: just agent role (e.g., "project-manager") - treat as instance 1
                // Extract agent role from the agent field
                const agentRole = (row.agent as string).split('-')[0] as Agent || 'project-manager'
                const legacyAgentId = `${agentRole}-1`
                if (!conversationsByAgent.has(legacyAgentId)) {
                  conversationsByAgent.set(legacyAgentId, { messages: [], createdAt: new Date() })
                }
                const conv = conversationsByAgent.get(legacyAgentId)!
                const msgId = row.sequence as number
                maxMessageId = Math.max(maxMessageId, msgId)
                conv.messages.push({
                  id: msgId,
                  agent: row.role === 'user' ? 'user' : agentRole,
                  content: row.content ?? '',
                  timestamp: row.created_at ? new Date(row.created_at) : new Date(),
                  // Note: Image attachments from DB don't have File objects, so we omit them
                  // File objects can't be serialized/restored from Supabase
                  imageAttachments: undefined,
                })
                if (conv.messages.length === 1 || (row.created_at && new Date(row.created_at) < conv.createdAt)) {
                  conv.createdAt = row.created_at ? new Date(row.created_at) : new Date()
                }
              } else {
                // New format: agent-role-instanceNumber
                if (!conversationsByAgent.has(agentId)) {
                  conversationsByAgent.set(agentId, { messages: [], createdAt: new Date() })
                }
                const conv = conversationsByAgent.get(agentId)!
                const msgId = row.sequence as number
                maxMessageId = Math.max(maxMessageId, msgId)
                conv.messages.push({
                  id: msgId,
                  agent: row.role === 'user' ? 'user' : parsed.agentRole,
                  content: row.content ?? '',
                  timestamp: row.created_at ? new Date(row.created_at) : new Date(),
                  // Note: Image attachments from DB don't have File objects, so we omit them
                  // File objects can't be serialized/restored from Supabase
                  imageAttachments: undefined,
                })
                if (conv.messages.length === 1 || (row.created_at && new Date(row.created_at) < conv.createdAt)) {
                  conv.createdAt = row.created_at ? new Date(row.created_at) : new Date()
                }
              }
            }
          }

          // Build Conversation objects and track max sequences
          const loadedConversations = new Map<string, Conversation>()
          for (const [agentId, { messages, createdAt }] of conversationsByAgent.entries()) {
            const parsed = parseConversationId(agentId)
            const sortedMessages = messages.sort((a, b) => a.id - b.id) // Ensure chronological order
            const minSeq = sortedMessages.length > 0 ? Math.min(...sortedMessages.map(m => m.id)) : undefined
            const maxSeq = sortedMessages.length > 0 ? Math.max(...sortedMessages.map(m => m.id)) : 0
            
            // Check if there are more messages to load (if we loaded exactly MESSAGES_PER_PAGE, there might be more)
            const hasMore = messages.length >= MESSAGES_PER_PAGE
            
            if (parsed) {
              agentSequenceRefs.current.set(agentId, maxSeq)
              
              // Backward compatibility: update pmMaxSequenceRef for PM conversations
              if (parsed.agentRole === 'project-manager' && parsed.instanceNumber === 1) {
                pmMaxSequenceRef.current = maxSeq
              }
              
              loadedConversations.set(agentId, {
                id: agentId,
                agentRole: parsed.agentRole,
                instanceNumber: parsed.instanceNumber,
                messages: sortedMessages,
                createdAt,
                oldestLoadedSequence: minSeq,
                hasMoreMessages: hasMore,
              })
            } else {
              // Legacy format: treat as instance 1
              const agentRole = agentId.split('-')[0] as Agent
              const legacyId = `${agentRole}-1`
              agentSequenceRefs.current.set(legacyId, maxSeq)
              
              if (agentRole === 'project-manager') {
                pmMaxSequenceRef.current = maxSeq
              }
              
              loadedConversations.set(legacyId, {
                id: legacyId,
                agentRole,
                instanceNumber: 1,
                messages: sortedMessages,
                createdAt,
                oldestLoadedSequence: minSeq,
                hasMoreMessages: hasMore,
              })
            }
          }

          // Merge Supabase conversations with localStorage conversations (Supabase takes precedence)
          // This ensures we have all conversations (from localStorage) but with latest data from Supabase
          const mergedConversations = new Map<string, Conversation>(restoredConversations)
          for (const [convId, supabaseConv] of loadedConversations.entries()) {
            mergedConversations.set(convId, supabaseConv)
          }

          // Ensure PM conversation exists even if no messages were loaded (0124: fix PM chat clearing on refresh)
          const pmConvId = getConversationId('project-manager', 1)
          if (!mergedConversations.has(pmConvId)) {
            mergedConversations.set(pmConvId, {
              id: pmConvId,
              agentRole: 'project-manager',
              instanceNumber: 1,
              messages: [],
              createdAt: new Date(),
            })
          }

          messageIdRef.current = maxMessageId
          setConversations(mergedConversations)
          setPersistenceError(null)
        } catch (err) {
          console.error('[HAL] Error loading conversations from Supabase:', err)
          // Keep localStorage conversations (already set above)
        }
      })()
    }
  }, [supabaseUrl, supabaseAnonKey, setSupabaseUrl, setSupabaseAnonKey, setConversations, setPersistenceError, setConversationHistoryResetMessage, agentSequenceRefs, pmMaxSequenceRef, messageIdRef])

  // Get or create a conversation for an agent role (0070, 0111)
  const getOrCreateConversation = useCallback((agentRole: Agent, conversationId?: string): string => {
    if (conversationId && conversations.has(conversationId)) {
      return conversationId
    }
    // Create new conversation instance
    const instanceNumber = getNextInstanceNumber(conversations, agentRole)
    const newId = getConversationId(agentRole, instanceNumber)
    const newConversation: Conversation = {
      id: newId,
      agentRole,
      instanceNumber,
      messages: [],
      createdAt: new Date(),
    }
    setConversations((prev) => {
      const next = new Map(prev)
      next.set(newId, newConversation)
      return next
    })
    return newId
  }, [conversations, setConversations])

  // Get default conversation ID for an agent role (for backward compatibility) (0070)
  const getDefaultConversationId = useCallback((agentRole: Agent): string => {
    // Find existing conversation-1, or create it
    const defaultId = getConversationId(agentRole, 1)
    if (conversations.has(defaultId)) {
      return defaultId
    }
    return getOrCreateConversation(agentRole, defaultId)
  }, [conversations, getOrCreateConversation])

  return {
    loadConversationsForProject,
    getOrCreateConversation,
    getDefaultConversationId,
    MESSAGES_PER_PAGE,
  }
}
