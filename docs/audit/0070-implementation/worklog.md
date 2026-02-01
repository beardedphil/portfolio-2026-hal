# Worklog: 0070 - Scalable chat UI with multiple conversation instances per agent role

## Implementation steps

1. **Updated data structure to support multiple conversations**
   - Created `Conversation` type with `id`, `agentRole`, `instanceNumber`, `messages`, and `createdAt`
   - Changed `conversations` state from `Record<ChatTarget, Message[]>` to `Map<string, Conversation>`
   - Added helper functions: `getConversationId`, `parseConversationId`, `getNextInstanceNumber`
   - Updated `saveConversationsToStorage` and `loadConversationsFromStorage` to work with Map structure

2. **Added conversation management functions**
   - `getOrCreateConversation`: Gets existing conversation or creates new instance for an agent role
   - `getDefaultConversationId`: Gets or creates default conversation (instance #1) for backward compatibility
   - `getConversationsForAgent`: Gets all conversations for a specific agent role, sorted by instance number
   - `getConversationLabel`: Generates display label (e.g., "Implementation #1", "QA #2")
   - `getConversationPreview`: Extracts first line of last message as preview text

3. **Updated `addMessage` function**
   - Changed signature to accept `conversationId: string` instead of `target: ChatTarget`
   - Updates the specific conversation's messages array
   - Maintains backward compatibility for auto-move ticket logic

4. **Updated `triggerAgentRun` function**
   - Added optional `conversationId` parameter
   - Uses `getDefaultConversationId` when no conversation ID provided
   - All `addMessage` calls updated to use conversation IDs

5. **Updated `HAL_OPEN_CHAT_AND_SEND` handler**
   - For Implementation and QA agents, creates new conversation instance on each click
   - Opens modal with the new conversation and sets `selectedConversationId`
   - For PM, uses default conversation (backward compatible)

6. **Updated conversation loading from Supabase/localStorage**
   - Supabase loading creates default PM conversation (instance #1) with loaded messages
   - localStorage loading works with new Map structure
   - Message ID tracking updated to work across all conversations

7. **Created conversation card list UI**
   - Shows list of conversation cards for Implementation and QA agents
   - Each card displays agent role label and message preview
   - Cards are clickable and open modal on click
   - Empty state message when no conversations exist

8. **Implemented modal component**
   - Modal overlay with click-to-close functionality
   - Modal content includes header with conversation label and close button
   - Chat transcript and composer embedded in modal
   - Closing modal clears `selectedConversationId` and returns to list view

9. **Updated active messages logic**
   - For PM and Standup: always use default conversation
   - For Implementation/QA: use selected conversation when modal is open
   - Handles case when no conversation is selected (shows empty state)

10. **Added CSS styles**
    - Conversation list container with scrollable cards
    - Conversation card styles with hover and focus states
    - Modal overlay and content styles
    - Responsive design for modal (max-width, max-height)

11. **Maintained backward compatibility**
    - PM and Standup continue to use single default conversation
    - Existing localStorage data migrates to new structure on load
    - All existing functionality preserved for PM and Standup
