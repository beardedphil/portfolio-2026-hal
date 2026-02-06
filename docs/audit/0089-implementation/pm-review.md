# PM Review: Close Ticket After HITL Pass/Fail (0089)

## Summary (1–3 bullets)

- Updated `onValidationPass` and `onValidationFail` handlers to close ticket detail modal after move completes
- Modal closes automatically after ~1.6 seconds (after refetch delay) to ensure move is visible
- Uses existing `handleCloseTicketDetail` function for consistent behavior

## Likelihood of success

**Score (0–100%)**: 95%

**Why (bullets):**
- Simple, focused change to existing handlers
- Reuses well-tested close handler function
- Timing delay ensures UI state is consistent before close
- No new state management or complex logic

## What to verify (UI-only)

- Open ticket in Human in the Loop column → Click Pass → Verify modal closes and ticket appears in Done column
- Open ticket in Human in the Loop column → Click Fail → Verify modal closes and ticket appears in To Do column
- Verify no lingering ticket state after close (open another ticket, confirm clean state)

## Potential failures (ranked)

1. **Modal closes too quickly** — Modal closes before user sees ticket move to new column — Likely cause: Timing delay too short or refetch not completing — Confirm: Watch Kanban board after clicking Pass/Fail, verify ticket moves before modal closes
2. **Modal doesn't close** — Modal remains open after Pass/Fail click — Likely cause: `handleCloseTicketDetail` not being called or error in handler — Confirm: Check browser console for errors, verify `setTimeout` is executing
3. **Lingering state after close** — Previous ticket content or artifacts visible when opening new ticket — Likely cause: State not fully cleared in `handleCloseTicketDetail` — Confirm: Open ticket A, Pass/Fail it, then open ticket B, verify only ticket B content is visible

## Audit completeness check

- **Artifacts present**: plan / worklog / changed-files / decisions / verification / pm-review
- **Traceability gaps**: None

## Follow-ups (optional)

- None
