# PM Review: 0032 - Bug: Will Not Implement column reverts to Unassigned on refresh

## Summary (1–3 bullets)

- Fixed Will Not Implement column persistence by adding `col-wont-implement` to KANBAN_COLUMN_IDS in Kanban App and all three sync-tickets.js scripts so the post-sync "normalize" step no longer resets those tickets to Unassigned.
- Added Will Not Implement to DEFAULT_KANBAN_COLUMNS_SEED, EMPTY_KANBAN_COLUMNS, and File System mode so the column exists in new setups.
- Added migration on connect: when kanban_columns has rows but lacks col-wont-implement, insert it so existing DBs get the column.

## Likelihood of success

**Score (0–100%)**: 90%

**Why (bullets):**
- Root cause (sync scripts and Kanban treating col-wont-implement as invalid and resetting to Unassigned) is addressed at all touchpoints.
- Migration ensures existing Supabase deployments get the column on next connect.
- Error handling for failed moves already exists (setSupabaseLastError → "Last poll error" in UI).

## What to verify (UI-only)

- Move a ticket to Will Not Implement, refresh the page: ticket remains in Will Not Implement.
- Run npm run sync-tickets, then refresh Kanban: ticket in Will Not Implement is not reset.
- Simulate move failure (e.g. disconnect network before drop): UI shows in-app error, ticket reverts (expected).

## Potential failures (ranked)

1. **Existing DB with custom columns** — Migration inserts col-wont-implement; if a project has a different "won't implement" column id, there could be duplication. Low risk; standard id is col-wont-implement.
2. **Sync-tickets run from different project root** — If a project uses a vendored/copied sync script that wasn't updated, resets could still occur. Mitigation: updated all three copies (root, projects/kanban, projects/hal-agents).

## Audit completeness check

- **Artifacts present**: plan / worklog / changed-files / decisions / verification / pm-review
- **Traceability gaps**: None.

## Follow-ups (optional)

- None.
