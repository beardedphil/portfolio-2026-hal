# PM Review: 0026 - Kanban tickets persist column on refresh

## Summary (1–3 bullets)

- Fixed Supabase Kanban so moved tickets no longer revert to wrong columns on refresh by applying optimistic local state updates and replacing immediate refetch with a 1.5s delayed refetch after each move.
- Single file change: `projects/kanban/src/App.tsx` (optimistic setSupabaseTickets + REFETCH_AFTER_MOVE_MS + delayed refetch on success, immediate refetch on failure).

## Likelihood of success

**Score (0–100%)**: 85%

**Why (bullets):**
- Root cause (immediate refetch returning stale data) is addressed by not refetching until after a short delay.
- Optimistic update ensures UI matches user action immediately; 10s poll and delayed refetch keep state in sync with DB.

## What to verify (UI-only)

- Move several tickets to different columns, refresh: all stay in new columns.
- Reorder within a column, refresh: order preserved.
- Quick successive moves then refresh: all moves persist.

## Potential failures (ranked)

1. **DB write slower than 1.5s** — After move, ticket could briefly show in new column then jump back when delayed refetch runs. Mitigation: 10s poll will eventually show correct state; increase REFETCH_AFTER_MOVE_MS if needed. Confirm via board state after refresh.
2. **Supabase update fails** — We refetch immediately so board reverts; user sees last good state. Check in-app connection/error state if moves keep reverting.
3. **Multiple rapid moves** — Each move schedules its own delayed refetch; refetches may reorder. Acceptable; final state after 1.5s + last move should be correct. Verify by waiting a couple seconds after last move then refreshing.

## Audit completeness check

- **Artifacts present**: plan / worklog / changed-files / decisions / verification / pm-review
- **Traceability gaps**: None.

## Follow-ups (optional)

- None.
