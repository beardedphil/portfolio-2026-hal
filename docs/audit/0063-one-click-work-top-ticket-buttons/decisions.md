# Decisions (0063-one-click-work-top-ticket-buttons)

## Ticket ID extraction

- Used existing `extractTicketId` function which works for both:
  - Supabase: cardIds are ticket IDs (e.g., "0001") → extracts "0001"
  - File-based: cardIds are file paths (e.g., "docs/tickets/0001-...md") → extracts "0001"
- This approach is consistent with existing codebase patterns

## Button placement

- Placed buttons in column header alongside the remove button
- Used a flex container (`.column-header-actions`) to group header actions
- Buttons appear before the remove button for better visibility

## Styling

- Used purple theme (`#8b5cf6`, `#f3e8ff`) to match HAL app color palette
- Disabled state shows "No tickets" text and reduced opacity
- Button is compact to fit in column header without crowding

## Message format

- Unassigned: "Please prepare ticket {ID} and get it ready (Definition of Ready)."
- To Do: "Please implement ticket {ID}."
- QA: "Please QA ticket {ID}."
- Messages are concise and action-oriented

## PostMessage communication

- Used `HAL_OPEN_CHAT_AND_SEND` message type for consistency with existing HAL_* message types
- Parent window handles both chat switching and message sending in one action
- This ensures the user sees the message immediately after chat opens
