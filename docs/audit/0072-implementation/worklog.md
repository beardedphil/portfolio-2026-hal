# Worklog: 0072 - Ensure each Kanban column header "work top ticket" button sends exactly one message per click

1. **Identified duplicate message issue**: Found that `HAL_OPEN_CHAT_AND_SEND` handler (line 1418) calls `addMessage`, and then `triggerAgentRun` (line 808) also calls `addMessage` for non-DB cases, causing duplicate messages.

2. **Fixed duplicate message**: Removed the `addMessage` call from `HAL_OPEN_CHAT_AND_SEND` handler. The `triggerAgentRun` function already handles adding messages appropriately based on whether DB is used or not.

3. **Added diagnostic tracking**: 
   - Added `lastWorkButtonClick` state to track the most recent work button click event
   - Generate unique event ID for each click: `work-btn-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
   - Store timestamp, chat target, and message with each event

4. **Added diagnostic indicator**: Added a new diagnostic row in the diagnostics panel that displays:
   - Event ID
   - Timestamp (formatted as locale time string)
   - Chat target
   - Only shows when at least one work button click has occurred
