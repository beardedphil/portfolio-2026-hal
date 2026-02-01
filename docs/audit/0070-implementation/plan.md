# Plan: Scalable chat UI with multiple conversation instances per agent role

## Approach

1. **Update data structure** to support multiple conversation instances per agent role
   - Change from `Record<ChatTarget, Message[]>` to `Map<string, Conversation>`
   - Each conversation has a unique ID (e.g., "implementation-agent-1", "qa-agent-2")
   - Conversation includes agent role, instance number, messages, and creation timestamp

2. **Create conversation card list UI** for Implementation and QA agents
   - Show vertical list of conversation cards
   - Each card displays agent role label (e.g., "Implementation #1", "QA #2") and message preview
   - Cards are clickable to open the conversation thread

3. **Implement modal component** for viewing conversation threads
   - Modal shows full conversation thread for selected conversation
   - Includes chat transcript and composer for sending messages
   - Closing modal returns to conversation list

4. **Update HAL_OPEN_CHAT_AND_SEND handler** to create new conversation instances
   - For Implementation and QA agents, create a new conversation instance on each button click
   - Open modal with the new conversation and initial message
   - PM and Standup continue to use single default conversation (backward compatible)

5. **Update persistence logic** to handle multiple conversations
   - Update localStorage serialization/deserialization for new structure
   - Update Supabase loading to create default PM conversation
   - Ensure conversations persist across sessions

6. **Add CSS styles** for conversation cards and modal
   - Card styles with hover states
   - Modal overlay and content styles
   - Responsive design considerations

## File touchpoints

- `src/App.tsx`: Update data structure, add conversation management functions, update UI to show cards/modal, update handlers
- `src/index.css`: Add styles for conversation cards and modal
