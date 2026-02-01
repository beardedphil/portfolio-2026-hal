# PM Review (0063-one-click-work-top-ticket-buttons)

## Summary (1–3 bullets)

- Added one-click work buttons to Unassigned, To Do, and QA column headers in Kanban
- Buttons extract top ticket ID and send postMessage to parent HAL app to open appropriate chat with prefilled message
- Buttons are disabled when columns are empty

## Likelihood of success

**Score (0–100%)**: 95%

**Why (bullets):**
- Implementation follows existing patterns (postMessage communication, extractTicketId function)
- Simple, focused feature with clear acceptance criteria
- Uses existing chat infrastructure (addMessage, setSelectedChatTarget)
- Potential edge case: ticket ID extraction from different sources (Supabase vs file-based) is handled by existing function

## What to verify (UI-only)

- Buttons appear in Unassigned, To Do, and QA column headers
- Clicking a button opens/switches to the correct chat and sends a message with the top ticket ID
- Buttons are disabled and show "No tickets" when columns are empty
- Other columns do not show work buttons

## Potential failures (ranked)

1. **PostMessage not received by parent** — Button click does nothing, chat doesn't open — Likely cause: iframe communication issue or parent window not listening — In-app check: Open browser console, check for postMessage events; verify HAL app is loaded and listening
2. **Wrong ticket ID extracted** — Message shows incorrect or missing ticket ID — Likely cause: extractTicketId fails for Supabase ticket IDs (though it should work) — In-app check: Verify ticket ID in message matches the visible ticket card at top of column
3. **Button not visible** — Button doesn't appear in column header — Likely cause: CSS issue or column ID mismatch — In-app check: Inspect column header HTML, verify button element exists but may be hidden
4. **Chat doesn't switch** — Message appears but in wrong chat — Likely cause: setSelectedChatTarget not working or chatTarget value incorrect — In-app check: Verify chat dropdown shows correct agent selected after button click

## Audit completeness check

- **Artifacts present**: plan / worklog / changed-files / decisions / verification / pm-review
- **Traceability gaps**: None

## Follow-ups (optional)

- None
