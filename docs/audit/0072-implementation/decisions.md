# Decisions: 0072 - Ensure each Kanban column header "work top ticket" button sends exactly one message per click

## Duplicate message fix

- **Removed `addMessage` from `HAL_OPEN_CHAT_AND_SEND` handler**: The `triggerAgentRun` function already handles adding messages appropriately:
  - For DB cases (project-manager with DB): adds message with sequence number after DB insert
  - For non-DB cases: adds message immediately before triggering agent run
- **Why**: This ensures each click results in exactly one message being added, regardless of whether DB is used or not.

## Diagnostic indicator

- **Event ID format**: `work-btn-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  - Combines timestamp with random string for uniqueness
  - Human-readable format that's easy to verify
- **Display location**: Diagnostics panel (only visible when diagnostics are expanded)
- **Information shown**: Event ID, timestamp (locale time string), and chat target
- **Why**: Allows humans to verify that each button click generates exactly one event, confirming single-click behavior without external tools.

## No changes to Kanban component

- The Kanban component (`projects/kanban/src/App.tsx`) already sends the `HAL_OPEN_CHAT_AND_SEND` message correctly with a single postMessage call per click.
- The issue was in the HAL app's message handler, not in the Kanban component.
