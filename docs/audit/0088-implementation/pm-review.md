# PM Review: 0088 - QA Agent automatically moves ticket to Doing when starting, and to Human in the Loop/To Do on Pass/Fail

## Summary

- Added move-to-Doing logic when QA agent starts work (ticket in QA column moves to Doing)
- Verified existing Pass/Fail moves work correctly (PASS → Human in the Loop, FAIL → To Do)
- Both QA endpoints (`api/agent-runs/launch.ts` and `vite.config.ts`) now move tickets to Doing when QA starts

## Likelihood of success

**Score (0–100%)**: 90%

**Why (bullets):**
- Reuses proven pattern from Implementation Agent (0053) for move-to-Doing logic
- Pass/Fail moves already implemented and working correctly
- Error handling is non-blocking (launch continues even if move fails)
- Both QA endpoints updated consistently

## What to verify (UI-only)

- Start QA on a ticket in QA column → ticket moves to Doing column
- Complete QA with PASS → ticket moves to Human in the Loop column
- Complete QA with FAIL → ticket moves to To Do column
- Refresh page after each move → ticket stays in new column (persistence)

## Potential failures (ranked)

1. **Move fails silently** — Ticket stays in QA column even after QA starts. **Likely cause**: Supabase connection issue or permission error. **Diagnosis**: Check Diagnostics panel for error messages; check Supabase connection status in app.

2. **Ticket moves but Pass/Fail doesn't move** — Ticket moves to Doing but doesn't move on completion. **Likely cause**: QA agent doesn't complete or verdict detection fails. **Diagnosis**: Check QA chat for completion message; verify qa-report.md exists and has verdict.

3. **Ticket detail view shows wrong column** — Board shows correct column but detail view doesn't update. **Likely cause**: Detail view not polling Supabase or caching issue. **Diagnosis**: Close and reopen detail view; check if it reads from Supabase.

4. **Move happens twice** — Ticket moves to Doing twice or jumps columns. **Likely cause**: Both QA endpoints called or duplicate move logic. **Diagnosis**: Check Diagnostics panel for duplicate move messages; verify only one endpoint is used.

## Audit completeness check

- **Artifacts present**: plan / worklog / changed-files / decisions / verification / pm-review
- **Traceability gaps**: None

## Follow-ups (optional)

- Monitor QA agent runs to verify moves work correctly in practice
- Consider adding explicit column validation before Pass/Fail moves (ensure ticket is in Doing)
