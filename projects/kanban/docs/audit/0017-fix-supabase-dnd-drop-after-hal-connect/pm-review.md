# PM Review (0017-fix-supabase-dnd-drop-after-hal-connect)

## Summary (1–3 bullets)

- Fixed Supabase DnD persistence after HAL connect by ensuring `connectSupabase(url,key)` also sets the state used by update/refetch.
- Improved in-app diagnostics by returning an error message from `updateSupabaseTicketKanban` and logging it on failure.

## Likelihood of success

**Score (0–100%)**: 90%

**Why (bullets):**
- Root cause is direct and confirmed in `worklog.md`: update/refetch read from state that wasn’t being set by connect paths.
- Fix is minimal and unifies credential source-of-truth; low risk of collateral impact.
- Diagnostics improvement makes failures human-debuggable in the Action Log.

## What to verify (UI-only)

- Connect Supabase via HAL (or via Connect Project Folder) and drag a ticket between columns.
- Confirm the ticket stays put after polling/refresh and the Action Log shows success or a descriptive failure.

## Potential failures (ranked)

1. **Still snaps back after drop** — would indicate Supabase update is failing (RLS, network, wrong keys) even though state is set. Confirm via Action Log error text and the Supabase error panel in Debug.
2. **Connect appears “connected” but no updates** — would indicate another credential source mismatch or the update path not using the updated state. Confirm via diagnostics: ensure URL/key are present in the current Supabase config state.
3. **Regression in non-HAL connect flow** — folder picker connect should still allow DnD updates. Confirm by repeating the same steps using the in-app connect UI.

## Audit completeness check

- **Artifacts present**: plan / worklog / changed-files / decisions / verification / pm-review
- **Traceability gaps**:
  - `verification.md` includes dev-server prerequisites; acceptable as setup, but browser-only steps should remain the focus after startup.

## Follow-ups (optional)

- Consider surfacing the active Supabase project (masked) in Debug so “which connection am I using?” is clearer for humans.
