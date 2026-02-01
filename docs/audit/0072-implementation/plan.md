# Plan: 0072 - Ensure each Kanban column header "work top ticket" button sends exactly one message per click

## Approach

1. **Identify duplicate message source**: The `HAL_OPEN_CHAT_AND_SEND` handler in `src/App.tsx` adds a message, then `triggerAgentRun` also adds the message (for non-DB cases), causing duplicates.

2. **Fix duplicate message issue**: Remove the `addMessage` call from the `HAL_OPEN_CHAT_AND_SEND` handler since `triggerAgentRun` already handles adding messages appropriately based on DB usage.

3. **Add diagnostic indicator**: Track the most recent work button click event with a unique event ID and timestamp, display it in the diagnostics panel so humans can verify single-click behavior.

## File touchpoints

- `src/App.tsx`: 
  - Remove duplicate `addMessage` call from `HAL_OPEN_CHAT_AND_SEND` handler
  - Add state to track last work button click event (event ID, timestamp, chat target, message)
  - Add diagnostic row in diagnostics panel showing last work button click info
