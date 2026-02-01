# Worklog: 0053 - Implementation Agent automatically moves ticket from To Do to Doing

1. **Read ticket template and PM review template** to understand audit artifact format
2. **Reviewed Implementation Agent endpoint** in `vite.config.ts` (lines 372-668) to understand ticket fetch flow
3. **Identified column IDs**: `col-todo` (To Do) and `col-doing` (Doing) from grep results
4. **Modified ticket fetch query** to include `kanban_column_id` in the SELECT (line 435)
5. **Added move-to-Doing logic** after ticket fetch (before prompt building):
   - Check if `currentColumnId === 'col-todo'`
   - If yes, fetch max position in `col-doing` column
   - Calculate next position (max + 1)
   - Update ticket's `body_md` frontmatter with new column/position/movedAt
   - Update Supabase ticket row with new column, position, movedAt, and updated body_md
   - Run `sync-tickets.js` non-blocking to propagate to docs
   - Handle errors and emit `failed` stage with clear error message
6. **Verified frontend error handling**: Frontend already displays errors from `stage: 'failed'` in-app (lines 738-742, 752-757 in App.tsx)
7. **Created audit artifacts**: plan.md, worklog.md, changed-files.md, decisions.md, verification.md, pm-review.md
