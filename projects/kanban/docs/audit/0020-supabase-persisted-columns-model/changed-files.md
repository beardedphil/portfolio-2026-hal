# Changed files (0020-supabase-persisted-columns-model)

## Modified

| Path | Change |
|------|--------|
| `src/App.tsx` | Added `SupabaseKanbanColumnRow` type, `_SUPABASE_KANBAN_COLUMNS_SETUP_SQL`, `DEFAULT_KANBAN_COLUMNS_SEED`. Added state: `supabaseColumnsRows`, `supabaseColumnsLastRefresh`, `supabaseColumnsLastError`, `supabaseColumnsJustInitialized`. Connect flow: fetch `kanban_columns`, init defaults when empty, handle missing table. `supabaseColumns` useMemo: build from DB rows + tickets, unknown-column guard. `refetchSupabaseTickets`: also refetch columns. Add column: visible in Supabase mode, `handleCreateColumn` inserts into `kanban_columns`. Sync flow: dynamic column IDs for unassigned. Debug panel: columns source, count, refresh, error, unknown tickets. `hideRemove` for all Supabase columns. Clear columns on disconnect. |

## Created

| Path | Purpose |
|------|---------|
| `docs/audit/0020-supabase-persisted-columns-model/plan.md` | Implementation plan |
| `docs/audit/0020-supabase-persisted-columns-model/worklog.md` | Work log |
| `docs/audit/0020-supabase-persisted-columns-model/changed-files.md` | This file |
| `docs/audit/0020-supabase-persisted-columns-model/decisions.md` | Design/tech decisions |
| `docs/audit/0020-supabase-persisted-columns-model/verification.md` | UI-only verification steps |

## Unchanged
- package.json, index.html, src/main.tsx, src/index.css, src/frontmatter.ts, vite.config.ts, tsconfig.*, .gitignore
