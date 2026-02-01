# PM Review: 0072 - Ensure each Kanban column header "work top ticket" button sends exactly one message per click

## Summary (1–3 bullets)

- Removed duplicate `addMessage` call from `HAL_OPEN_CHAT_AND_SEND` handler to prevent duplicate messages
- Added diagnostic tracking for work button clicks (event ID, timestamp, chat target) displayed in diagnostics panel
- Fix applies to all three work buttons (PM, Implementation, QA) since they all use the same handler

## Likelihood of success

**Score (0–100%)**: 95%

**Why (bullets):**
- Simple, focused fix targeting the root cause (duplicate `addMessage` call)
- Diagnostic indicator provides clear verification path without external tools
- Change is isolated to message handler logic, low risk of side effects

## What to verify (UI-only)

- Click each of the three work buttons (PM, Implementation, QA) once and verify exactly one message appears in the corresponding chat
- Open Diagnostics panel and verify "Last work button click" shows event ID and timestamp after each click
- Verify event ID changes with each new click (confirming single-click processing)

## Potential failures (ranked)

1. **Messages still duplicate** — Two identical messages appear in chat after single click — Handler still has duplicate logic or `triggerAgentRun` is being called multiple times — Check Diagnostics panel: if event ID doesn't change between clicks, handler may be registered multiple times; check browser console for multiple `HAL_OPEN_CHAT_AND_SEND` events
2. **Diagnostic indicator not showing** — "Last work button click" row doesn't appear in Diagnostics panel — State not updating or diagnostic row condition not met — Verify Diagnostics panel is expanded; check that `lastWorkButtonClick` state is being set (add console.log if needed)
3. **Event ID not unique** — Same event ID appears for multiple clicks — Timestamp collision or random string generation issue — Check Diagnostics panel: event IDs should be different for each click; if same, check timestamp generation logic

## Audit completeness check

- **Artifacts present**: plan / worklog / changed-files / decisions / verification / pm-review
- **Traceability gaps**:
  - None — all changes are clearly documented and traceable

## Follow-ups (optional)

- None — implementation is complete and ready for QA
