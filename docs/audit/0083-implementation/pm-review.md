# PM Review: 0083 - Auto-move Ready Tickets to To Do on Creation

## Summary (1–3 bullets)

- Modified `create_ticket` tool to automatically move ready tickets to To Do column after creation
- Updated UI to show clear messages about ticket status (moved to To Do, move error, or missing items)
- Extended type system to pass move status from backend to frontend

## Likelihood of success

**Score (0–100%)**: 85%

**Why (bullets):**
- Implementation reuses existing, tested logic from `kanbanMoveTicketToTodoTool`
- Normalization and readiness evaluation already work correctly
- Error handling is in place for move failures
- UI messages provide clear feedback
- Backward compatibility maintained (only new ticket creation affected)

## What to verify (UI-only)

- Create a ready ticket via PM chat → verify it appears in To Do column and chat shows "moved to To Do" message
- Create a not-ready ticket → verify it stays in Unassigned and chat shows missing items
- Check Diagnostics > Tool Calls > create_ticket → verify output shows `movedToTodo`, `ready`, and `missingItems` fields
- Manually move an existing ticket → verify manual moves still work

## Potential failures (ranked)

1. **Auto-move fails silently** — Ticket created but stays in Unassigned even when ready, no error shown. **Likely cause**: Move error not properly caught or returned. **Diagnosis**: Check Diagnostics > Tool Calls > create_ticket output for `moveError` field; check browser console for errors.

2. **Position calculation error** — Ticket moved to To Do but appears at wrong position or causes UI glitch. **Likely cause**: Position calculation logic mismatch between repo-scoped and legacy modes. **Diagnosis**: Check Supabase `tickets.kanban_position` values; verify ticket appears in correct order in Kanban UI.

3. **UI message not shown** — Ticket moved successfully but chat doesn't show the "moved to To Do" message. **Likely cause**: Message logic not triggered or reply from PM agent overrides it. **Diagnosis**: Check PM chat response; verify `ticketCreationResult.movedToTodo` is set in Diagnostics.

4. **Normalization doesn't work** — Ticket with non-standard headings not normalized, fails readiness check. **Likely cause**: `normalizeBodyForReady` not called or regex patterns don't match. **Diagnosis**: Check Supabase `tickets.body_md` for normalized headings; verify readiness evaluation in Diagnostics.

5. **Existing tickets affected** — Manual moves or existing tickets behave differently. **Likely cause**: Logic accidentally modifies tickets other than newly created ones. **Diagnosis**: Verify existing tickets remain in their columns; test manual move via PM chat.

## Audit completeness check

- **Artifacts present**: plan / worklog / changed-files / decisions / verification / pm-review
- **Traceability gaps**: None identified

## Follow-ups (optional)

- Monitor user feedback on auto-move behavior
- Consider adding telemetry for move success/failure rates
