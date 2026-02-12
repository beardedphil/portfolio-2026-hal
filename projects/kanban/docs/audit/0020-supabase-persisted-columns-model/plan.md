# Plan (0020-supabase-persisted-columns-model)

## Goal
Add a real persistence model for kanban columns in Supabase so "Add column" works in Supabase mode and columns survive refresh/polling.

## Deliverable (UI-only)
When Supabase is connected, a human can: see columns loaded from Supabase, click Add column to create a new column, refresh and see it persist, drag tickets into new columns with persistence, use in-app diagnostics for column sync state.

## Acceptance criteria (summary)
- Supabase schema includes `kanban_columns` table (id, title, position, created_at, updated_at)
- Load columns from `kanban_columns` ordered by position
- Add column visible and functional in Supabase mode
- New columns persist to DB and survive refresh
- Tickets can be moved into custom columns; persists after polling/refresh
- Default columns (Unassigned, To-do, Doing, Done) initialized when table empty
- Debug panel: columns source, column count, last columns refresh, last columns error, unknown column guard

## Steps

1. **Schema and types**
   - Add `_SUPABASE_KANBAN_COLUMNS_SETUP_SQL` constant with `kanban_columns` table DDL
   - Add `SupabaseKanbanColumnRow` type and `DEFAULT_KANBAN_COLUMNS_SEED` for init

2. **State and connect flow**
   - Add `supabaseColumnsRows`, `supabaseColumnsLastRefresh`, `supabaseColumnsLastError`, `supabaseColumnsJustInitialized`
   - In `connectSupabase`: after tickets, fetch `kanban_columns`; if table missing, set error and disconnect; if empty, insert defaults and set `supabaseColumnsJustInitialized`
   - Clear columns state on disconnect

3. **Columns derivation**
   - Replace hardcoded `supabaseColumns` with useMemo that builds from `supabaseColumnsRows` + `supabaseTickets` (group tickets by column id)
   - Handle unknown `kanban_column_id`: put ticket in first column, track IDs for diagnostics

4. **Refetch**
   - Update `refetchSupabaseTickets` to also fetch `kanban_columns` and update `supabaseColumnsRows`

5. **Add column in Supabase mode**
   - Show Add column when Supabase board active (remove `!supabaseBoardActive` gate)
   - In `handleCreateColumn`: when `supabaseBoardActive`, insert into `kanban_columns`, then refetch
   - Log "Initialized default columns" via useEffect when `supabaseColumnsJustInitialized` is set

6. **Ticket DnD**
   - DnD already updates `kanban_column_id` via `updateSupabaseTicketKanban`; columns now dynamic, so any valid column id works
   - Sync flow: fetch columns, use first column id for unassigned fallback instead of hardcoded `col-unassigned`

7. **Diagnostics**
   - Debug panel: columns source = Supabase, column count, last columns refresh, last columns error
   - When tickets have unknown column ids, show "Tickets with unknown column (moved to first): ..."

8. **Audit**
   - Create `docs/audit/0020-supabase-persisted-columns-model/` with plan, worklog, changed-files, decisions, verification

## Out of scope
- Multi-board support
- Column rename/delete UI
- Real-time subscriptions
