import { useCallback } from 'react'
import type { ChatTarget } from '../types/app'
import type { ImageAttachment } from '../types/app'
import type { Message, Conversation, Agent } from '../lib/conversationStorage'

interface UseChatHandlersParams {
  inputValue: string
  setInputValue: (value: string) => void
  imageAttachment: ImageAttachment | null
  setImageAttachment: (attachment: ImageAttachment | null) => void
  imageError: string | null
  setImageError: (error: string | null) => void
  setSendValidationError: (error: string | null) => void
  conversations: Map<string, Conversation>
  getDefaultConversationId: (agentRole: Agent) => string
  addMessage: (
    conversationId: string,
    agent: Message['agent'],
    content: string,
    id?: number,
    imageAttachments?: ImageAttachment[],
    promptText?: string
  ) => void
  triggerAgentRun: (content: string, target: ChatTarget, imageAttachments?: ImageAttachment[], conversationId?: string) => void
  setLastSendPayloadSummary: (summary: string) => void
  setLastAgentError: (error: string | null) => void
}

export function useChatHandlers({
  inputValue,
  setInputValue,
  imageAttachment,
  setImageAttachment,
  imageError,
  setImageError,
  setSendValidationError,
  conversations,
  getDefaultConversationId,
  addMessage,
  triggerAgentRun,
  setLastSendPayloadSummary,
  setLastAgentError,
}: UseChatHandlersParams) {
  const handleSendForTarget = useCallback(
    (target: ChatTarget, conversationIdOverride?: string | null) => {
      const content = inputValue.trim()

      // Clear previous validation error
      setSendValidationError(null)

      // Validate: must have either text or image
      if (!content && !imageAttachment) {
        setSendValidationError('Please enter a message or attach an image before sending.')
        return
      }

      // Don't send if there's an image error
      if (imageError) {
        setSendValidationError('Please fix the image error before sending.')
        return
      }

      // Get or create conversation ID for the provided chat target (0070)
      let convId: string
      if (conversationIdOverride && conversations.has(conversationIdOverride)) {
        convId = conversationIdOverride
      } else {
        convId = getDefaultConversationId(target === 'project-manager' ? 'project-manager' : target)
      }

      const attachments = imageAttachment ? [imageAttachment] : undefined

      // Track payload summary for diagnostics (0077)
      const hasText = content.length > 0
      const hasImages = attachments && attachments.length > 0
      let payloadSummary: string
      if (hasText && hasImages) {
        payloadSummary = `Text + ${attachments.length} image${attachments.length > 1 ? 's' : ''}`
      } else if (hasText) {
        payloadSummary = 'Text only'
      } else if (hasImages) {
        payloadSummary = `${attachments.length} image${attachments.length > 1 ? 's' : ''} only`
      } else {
        payloadSummary = 'Empty (should not happen)'
      }
      setLastSendPayloadSummary(payloadSummary)

      // Don't add message here for PM agent - triggerAgentRun will handle it (0153: prevent duplicates)
      // For non-PM agents, triggerAgentRun doesn't add user messages, so we add it here
      if (target !== 'project-manager') {
        addMessage(convId, 'user', content, undefined, attachments)
      }
      setInputValue('')
      setImageAttachment(null)
      setImageError(null)
      setSendValidationError(null)
      setLastAgentError(null)

      // Use the extracted triggerAgentRun function
      triggerAgentRun(content, target, attachments, convId)
    },
    [
      inputValue,
      imageAttachment,
      imageError,
      conversations,
      addMessage,
      triggerAgentRun,
      getDefaultConversationId,
      setInputValue,
      setImageAttachment,
      setImageError,
      setSendValidationError,
      setLastSendPayloadSummary,
      setLastAgentError,
    ]
  )

  /** Send "Continue" to PM for multi-batch bulk operations (e.g. move all tickets). */
  const handleContinueBatch = useCallback(() => {
    const convId = getDefaultConversationId('project-manager')
    triggerAgentRun('Continue', 'project-manager', undefined, convId)
  }, [getDefaultConversationId, triggerAgentRun])

  return {
    handleSendForTarget,
    handleContinueBatch,
  }
}
