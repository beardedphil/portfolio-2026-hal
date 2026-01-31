# QA Report: 0026 - Kanban tickets persist column on refresh

## 1. Ticket & deliverable

- **Goal:** Fix Supabase-backed Kanban so that the last few moved tickets no longer revert to wrong columns after a page refresh.
- **Deliverable:** After moving tickets between columns (or reordering within a column), a full page refresh shows all tickets in the same columns and order as before refresh.
- **Acceptance criteria:** Connect to a project (Supabase) and move several tickets to different columns; refresh the page (F5); all tickets remain in the columns where they were placed; none "jump back" to previous columns.

## 2. Audit artifacts

All required artifacts are present in `docs/audit/0026-kanban-tickets-persist-column-on-refresh/`:

- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md`
- `pm-review.md`

## 3. Code review — PASS

Implementation in `projects/kanban/src/App.tsx` matches the ticket and `changed-files.md`:

| Requirement | Implementation |
|-------------|----------------|
| `REFETCH_AFTER_MOVE_MS = 1500` | Present (line 111). |
| Supabase **drop from list into column** | Optimistic `setSupabaseTickets` (lines 1589–1594), then `updateSupabaseTicketKanban`; on success `setTimeout(() => refetchSupabaseTickets(), REFETCH_AFTER_MOVE_MS)` (1603), on failure `refetchSupabaseTickets()` (1604). |
| Supabase **same-column reorder** | Optimistic `setSupabaseTickets` with new `kanban_position` order (1625–1636), loop `updateSupabaseTicketKanban`; on success delayed refetch (1649), on failure immediate refetch (1651). |
| Supabase **cross-column move** | Optimistic `setSupabaseTickets` (1652–1658), then `updateSupabaseTicketKanban`; on success delayed refetch (1666), on failure immediate refetch (1667). |

Root cause (immediate refetch overwriting with stale read) is addressed: optimistic update first, persist to Supabase in background, delayed refetch (1.5s) on success, immediate refetch on failure.

## 4. UI verification — Manual

Automated UI verification was not run because **Connect Project Folder** uses the native directory picker (not automatable), and the Supabase board must be active with tickets in the DB.

Manual steps (from `verification.md`):

1. **Move tickets then refresh:** Move two or three tickets to different columns (e.g. To-do → Doing, Doing → Done). Refresh the page (F5). **Pass:** All tickets remain in the columns where they were placed; none appear back in the previous column.
2. **Reorder within column then refresh:** Reorder a ticket within the same column (e.g. move it up or down in To-do). Refresh the page (F5). **Pass:** The ticket stays in the new position within that column.
3. **Quick successive moves then refresh:** Move ticket A to a column, then immediately move ticket B to another column, then refresh. **Pass:** Both A and B remain in their new columns after refresh.

## 5. Verdict

- **Implementation:** Complete and matches the ticket and plan.
- **Merge:** OK to merge after **manual UI verification** above is run (connect project, move/reorder tickets, refresh, confirm persistence).
