# Changed files (0013-dnd-supabase-tickets-into-kanban)

## Modified

| Path | Change |
|------|--------|
| `src/App.tsx` | Import `useMemo`. Constant `SUPABASE_POLL_INTERVAL_MS`. `supabaseBoardActive`; `useMemo` for `supabaseColumns` and `supabaseCards` from `supabaseTickets`. `columnsForDisplay` / `cardsForDisplay` use Supabase-derived state when `supabaseBoardActive`. Hide Add column and column remove when `supabaseBoardActive`. `DraggableSupabaseTicketItem` component. Supabase ticket list uses `DraggableSupabaseTicketItem`. `updateSupabaseTicketKanban` callback. Polling `useEffect` when `supabaseBoardActive`. `handleDragEnd`: skip column reorder when Supabase board active; branch for drag from Supabase list into column; branch for Supabase same-column reorder and cross-column move (update Supabase, refetch). Debug: Polling, Last poll time, Last poll error, Per-column ticket IDs. Hint "Drag into a column to save" in Supabase list. |

## Created

| Path | Purpose |
|------|---------|
| `docs/audit/0013-dnd-supabase-tickets-into-kanban/plan.md` | Implementation plan |
| `docs/audit/0013-dnd-supabase-tickets-into-kanban/worklog.md` | Work log |
| `docs/audit/0013-dnd-supabase-tickets-into-kanban/changed-files.md` | This file |
| `docs/audit/0013-dnd-supabase-tickets-into-kanban/decisions.md` | Design/tech decisions |
| `docs/audit/0013-dnd-supabase-tickets-into-kanban/verification.md` | UI-only verification steps |

## Unchanged
- package.json, index.html, src/main.tsx, src/frontmatter.ts, src/index.css, vite.config.ts, tsconfig.*, .gitignore.
