# PM Review: 0053 - Implementation Agent automatically moves ticket from To Do to Doing

## Summary

- Implementation Agent endpoint now fetches ticket's current `kanban_column_id` when starting a run
- If ticket is in `col-todo` (To Do), automatically moves it to `col-doing` (Doing) before launching cloud agent
- Move includes position calculation, frontmatter sync, and error handling with in-app error messages
- No backwards moves: tickets already in Doing or later columns are not moved

## Likelihood of success

**Score (0–100%)**: 95%

**Why:**
- Simple, focused change: only adds move logic after existing ticket fetch
- Reuses proven pattern: same move-to-column logic as moving to QA (lines 588-644)
- Frontend error handling already in place: `stage: 'failed'` errors are displayed in-app
- Clear acceptance criteria: all testable via UI without external tools

## What to verify (UI-only)

- **Happy path**: Ticket in To Do → start Implementation Agent run → ticket moves to Doing within seconds → persists after refresh
- **No backwards move**: Ticket in Doing/QA/Done → start run → ticket stays in current column
- **Error case**: Break Supabase connection → start run → error message appears in chat, ticket stays in To Do

## Potential failures (ranked)

1. **Column ID mismatch** — Ticket doesn't move or moves to wrong column. **Diagnosis**: Check Supabase `tickets.kanban_column_id` values; verify `col-todo` and `col-doing` exist in `kanban_columns` table. **In-app**: Kanban board shows ticket in wrong column or doesn't move.
2. **Move fails silently** — Ticket doesn't move but no error shown. **Diagnosis**: Check browser console for network errors; verify Supabase credentials in .env. **In-app**: Ticket stays in To Do, but Implementation Agent run proceeds (should fail fast).
3. **Position calculation error** — Ticket moves but appears at wrong position in Doing column. **Diagnosis**: Check Supabase query for max position; verify `kanban_position` values are numeric. **In-app**: Ticket appears at top or wrong position in Doing column.
4. **Frontmatter sync breaks** — Move succeeds but docs/tickets/*.md doesn't update. **Diagnosis**: Check `sync-tickets.js` output; verify frontmatter format matches expected pattern. **In-app**: After sync, ticket file frontmatter may be inconsistent (non-blocking; DB is source of truth).

## Audit completeness check

- **Artifacts present**: plan / worklog / changed-files / decisions / verification / pm-review
- **Traceability gaps**: None. All changes are in `vite.config.ts` with clear comments referencing ticket 0053.

## Follow-ups

- None. Implementation is complete and ready for QA.
