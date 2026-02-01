# Changed Files: 0072 - Ensure each Kanban column header "work top ticket" button sends exactly one message per click

## Modified

- `src/App.tsx`:
  - Removed duplicate `addMessage` call from `HAL_OPEN_CHAT_AND_SEND` handler (line 1418) to prevent duplicate messages
  - Added `lastWorkButtonClick` state to track most recent work button click event (event ID, timestamp, chat target, message)
  - Updated `HAL_OPEN_CHAT_AND_SEND` handler to generate unique event ID and track click events
  - Added diagnostic row in diagnostics panel (after "PM implementation source" row) showing last work button click event ID and timestamp
