# Plan: 0053 - Implementation Agent automatically moves ticket from To Do to Doing

## Goal
Ensure the kanban reflects active work by automatically moving a ticket from **To Do** to **Doing** when an Implementation Agent begins working on it.

## Approach

1. **Backend (vite.config.ts)**: When the Implementation Agent run starts and fetches the ticket from Supabase, also fetch the ticket's current `kanban_column_id`.
2. **Move logic**: If the ticket is in `col-todo` (To Do), move it to `col-doing` (Doing) before launching the cloud agent.
3. **Position calculation**: Calculate the next position in the Doing column (max position + 1) and update `kanban_position` and `kanban_moved_at`.
4. **Frontmatter sync**: Update the ticket's `body_md` frontmatter to keep DB and docs in sync (same pattern as moving to QA).
5. **Error handling**: If the move fails (DB write error, fetch error), emit a `failed` stage with a clear error message that the frontend displays in-app.
6. **Non-blocking sync**: Run `sync-tickets.js` after the move to propagate changes to docs (non-blocking; DB is source of truth).
7. **No backwards moves**: Only move if ticket is in `col-todo`; if already in `col-doing` or later, skip the move.

## File touchpoints

- `vite.config.ts` — Implementation Agent endpoint: fetch `kanban_column_id` with ticket, add move-to-Doing logic after ticket fetch, before prompt building
