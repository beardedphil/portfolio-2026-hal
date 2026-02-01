# Plan (0063-one-click-work-top-ticket-buttons)

## Goal

Add one-click "work the top ticket" buttons on key Kanban columns that open the relevant agent chat with the top ticket ID prefilled.

## Approach

- Add buttons to the column headers of Unassigned, To Do, and QA columns in the Kanban board
- Each button extracts the top ticket ID from its column (first cardId)
- When clicked, send a postMessage to the parent HAL app window with:
  - The chat target (project-manager, implementation-agent, or qa-agent)
  - A pre-filled message including the ticket ID
- Add a postMessage listener in HAL App.tsx to:
  - Switch to the requested chat target
  - Add the message to the chat
- Style the buttons with purple theme to match HAL app
- Disable buttons when columns are empty

## Files

- `projects/kanban/src/App.tsx`: Add button logic to SortableColumn component
- `projects/kanban/src/index.css`: Add styles for column-work-button
- `src/App.tsx`: Add postMessage listener for HAL_OPEN_CHAT_AND_SEND
- `docs/audit/0063-one-click-work-top-ticket-buttons/*`
