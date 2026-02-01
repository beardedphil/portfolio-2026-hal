# Worklog: 0069 - Make "Work top ticket" buttons reliably start agent runs

## Implementation steps

1. **Extracted agent run logic** into `triggerAgentRun` function
   - Moved all agent run logic (PM, Implementation, QA) from `handleSend` into a reusable `triggerAgentRun` callback
   - Function accepts `content: string` and `target: ChatTarget` parameters
   - Includes all error handling, status updates, and progress tracking

2. **Updated `HAL_OPEN_CHAT_AND_SEND` handler**
   - Modified to call `triggerAgentRun(data.message, data.chatTarget)` after adding the message
   - This ensures the agent run actually starts, not just that a message is posted

3. **Added status messages with ticket ID**
   - For Implementation Agent: `[Status] Starting Implementation run for ticket ${ticketId}...`
   - For QA Agent: `[Status] Starting QA run for ticket ${ticketId}...`
   - These messages appear in the chat when a run is initiated from the Kanban button

4. **Updated `handleSend` to use `triggerAgentRun`**
   - Refactored to call `triggerAgentRun(content, selectedChatTarget)` instead of duplicating logic
   - Standup handling remains separate (not part of agent runs)

5. **Error handling already in place**
   - Cursor API configuration check shows clear error message
   - API errors are caught and displayed in chat
   - Invalid ticket state errors are handled by the backend and shown in chat
