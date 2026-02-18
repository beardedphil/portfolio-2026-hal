import { useEffect } from 'react'
import { getConversationId } from '../lib/conversation-helpers'
import type { Conversation } from '../lib/conversationStorage'

interface UseProcessReviewWelcomeParams {
  conversations: Map<string, Conversation>
  supabaseUrl: string | null
  supabaseAnonKey: string | null
  addMessage: (
    conversationId: string,
    agent: 'process-review-agent',
    content: string,
    id?: number,
    imageAttachments?: unknown[],
    promptText?: string
  ) => void
}

export function useProcessReviewWelcome({
  conversations,
  supabaseUrl,
  supabaseAnonKey,
  addMessage,
}: UseProcessReviewWelcomeParams) {
  // Add initial welcome/status message to Process Review conversations when they're created (0111)
  useEffect(() => {
    const processReviewConvId = getConversationId('process-review-agent', 1)
    const conv = conversations.get(processReviewConvId)
    if (conv && conv.messages.length === 0) {
      const isAvailable = !!(supabaseUrl && supabaseAnonKey)
      const welcomeMessage = isAvailable
        ? '**Process Review Agent**\n\nI analyze ticket artifacts to suggest improvements to agent instructions and process documentation.\n\nTo run a review, say "Review process for ticket NNNN" (e.g., "Review process for ticket 0046").\n\nI\'m ready to help!'
        : '**Process Review Agent**\n\nI analyze ticket artifacts to suggest improvements to agent instructions and process documentation.\n\n⚠️ **Currently unavailable**: Supabase is not configured. Connect to Supabase to enable Process Review.\n\nOnce Supabase is connected, you can say "Review process for ticket NNNN" to run a review.'
      addMessage(processReviewConvId, 'process-review-agent', welcomeMessage)
    }
  }, [conversations, supabaseUrl, supabaseAnonKey, addMessage])
}
