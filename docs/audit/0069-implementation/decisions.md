# Decisions: 0069 - Make "Work top ticket" buttons reliably start agent runs

## Design decisions

### Extracted `triggerAgentRun` function

- **Why:** The agent run logic was duplicated between `handleSend` and needed to be called from `HAL_OPEN_CHAT_AND_SEND`. Extracting it into a reusable function eliminates duplication and ensures consistent behavior.
- **Trade-off:** The function is large and has many dependencies, but this is necessary to maintain all the existing functionality (error handling, progress tracking, auto-move, etc.).

### Status messages show ticket ID

- **Why:** The acceptance criteria require that the UI clearly indicates which ticket ID the button targeted. Adding a status message at the start of the run makes this visible in the chat.
- **Format:** `[Status] Starting Implementation run for ticket ${ticketId}...` or `[Status] Starting QA run for ticket ${ticketId}...`
- **When:** Only shown when a ticket ID is successfully extracted from the message content.

### Error handling

- **Why:** Existing error handling in `triggerAgentRun` already covers:
  - Missing Cursor API configuration (shows clear message)
  - API errors (caught and displayed)
  - Invalid ticket state (handled by backend, shown in chat)
- **No changes needed:** The existing error handling satisfies the acceptance criteria.
