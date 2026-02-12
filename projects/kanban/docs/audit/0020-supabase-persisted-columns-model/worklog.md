# Worklog (0020-supabase-persisted-columns-model)

## Session
- **Date:** 2025-01-30
- **Ticket:** 0020-supabase-persisted-columns-model

## Work done
1. Added `kanban_columns` schema constant and `SupabaseKanbanColumnRow` type
2. Added state for columns rows, refresh time, error, and init flag
3. Updated `connectSupabase` to fetch columns, handle missing table, seed defaults when empty
4. Replaced hardcoded `supabaseColumns` with useMemo from DB rows + tickets; added unknown-column guard
5. Updated `refetchSupabaseTickets` to also refetch columns
6. Removed `!supabaseBoardActive` gate from Add column button
7. Extended `handleCreateColumn` for Supabase: insert into `kanban_columns`, refetch
8. Added useEffect to log "Initialized default columns" when seeding
9. Updated sync flow to use dynamic column IDs for unassigned fallback
10. Added columns diagnostics to Debug panel (source, count, refresh, error, unknown tickets)
11. Set `hideRemove` for all Supabase columns (column delete out of scope)
12. Clear `supabaseColumnsRows` on all disconnect paths

## Git status (when ready)
```
## main...origin/main
 M src/App.tsx
```
(Plus new audit files in docs/audit/0020-supabase-persisted-columns-model/)

## Build
- `npm run build` succeeds
