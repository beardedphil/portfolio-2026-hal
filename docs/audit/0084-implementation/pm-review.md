# PM Review (0084-implementation)

## Summary

- Modified Kanban work button to automatically move tickets to Doing when Implementation agent starts work
- Added message handler to move tickets from Doing to QA when Implementation agent completes
- Updated HAL app to send completion message to Kanban iframe

## Likelihood of success

**Score (0–100%)**: 85%

**Why:**
- Implementation follows existing patterns (postMessage communication, column movement logic)
- Automatic moves are validated against current ticket state (only move if in expected column)
- Ticket lookup supports both PK and display_id formats for robustness
- Minor risk: message timing if Kanban iframe not fully loaded when completion message sent

## What to verify (UI-only)

- Click "Implement top ticket" on To Do column → ticket immediately moves to Doing
- Complete Implementation agent work → ticket automatically moves from Doing to QA
- Ticket detail view shows correct column after automatic moves
- Column counts update correctly after each automatic move
- Manually moved tickets are not affected by automatic moves

## Potential failures (ranked)

1. **Ticket doesn't move to Doing on work button click** — Ticket stays in To Do/Unassigned, work button click opens chat but no column change — Likely cause: Supabase update failed or ticket not found — Confirm: Check browser console for errors, verify Supabase connection in Kanban diagnostics
2. **Ticket doesn't move to QA on completion** — Ticket stays in Doing after Implementation agent completes — Likely cause: Completion message not sent or ticket lookup failed — Confirm: Check browser console for postMessage errors, verify ticket ID format matches (HAL-0084 vs 0084)
3. **Ticket detail view shows wrong column** — Detail modal shows old column after automatic move — Likely cause: Refetch not triggered or timing issue — Confirm: Close and reopen ticket detail, verify column matches board
4. **Column counts don't update** — Counts show incorrect numbers after automatic moves — Likely cause: Column computation not recalculating — Confirm: Refresh page, verify counts match actual ticket distribution

## Audit completeness check

- **Artifacts present**: plan / worklog / changed-files / decisions / verification / pm-review
- **Traceability gaps**: None

## Follow-ups

- Monitor for edge cases where ticket is moved manually during Implementation work
- Consider adding visual feedback (brief highlight) when automatic moves occur
