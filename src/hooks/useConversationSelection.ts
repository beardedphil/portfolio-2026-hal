import { useEffect, useRef } from 'react'
import type { Conversation } from '../lib/conversationStorage'

interface UseConversationSelectionParams {
  connectedProject: string | null
  selectedConversationId: string | null
  setSelectedConversationId: (id: string | null) => void
  conversations: Map<string, Conversation>
}

export function useConversationSelection({
  connectedProject,
  selectedConversationId,
  setSelectedConversationId,
  conversations,
}: UseConversationSelectionParams) {
  // Persist selected conversation to localStorage (0124: restore last-open conversation on refresh)
  useEffect(() => {
    if (connectedProject && selectedConversationId) {
      try {
        localStorage.setItem(`hal-selected-conversation-${connectedProject}`, selectedConversationId)
      } catch {
        // ignore localStorage errors
      }
    }
  }, [connectedProject, selectedConversationId])

  // Restore selected conversation after conversations are loaded (0124: restore last-open conversation on refresh)
  const restoredSelectedConvRef = useRef<string | null>(null)
  useEffect(() => {
    if (connectedProject && conversations.size > 0 && !restoredSelectedConvRef.current) {
      try {
        const savedSelectedConv = localStorage.getItem(`hal-selected-conversation-${connectedProject}`)
        if (savedSelectedConv && conversations.has(savedSelectedConv)) {
          setSelectedConversationId(savedSelectedConv)
          restoredSelectedConvRef.current = savedSelectedConv
        }
      } catch {
        // ignore localStorage errors
      }
    } else if (!connectedProject) {
      restoredSelectedConvRef.current = null
    }
  }, [connectedProject, conversations, selectedConversationId, setSelectedConversationId])

  return { restoredSelectedConvRef }
}
