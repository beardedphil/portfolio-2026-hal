# Changed files (0018-show-add-column-when-project-folder-connected)

## Modified

| Path | Change |
|------|--------|
| `src/App.tsx` | Add column shown when `!supabaseBoardActive` only (removed `ticketStoreConnected` from condition). `columnsForDisplay` / `cardsForDisplay` when not Supabase: use `ticketStoreConnected ? ticketColumns : columns` and `ticketStoreConnected ? ticketCards : cards`. `handleCreateColumn` adds to and checks duplicates against `ticketColumns` when `ticketStoreConnected`, else `columns`. Debug panel: "Connect Ticket Store (docs)" button when not connected; removed `_handleConnectProject` from `_retain`. |

## Created

| Path | Purpose |
|------|---------|
| `docs/audit/0018-show-add-column-when-project-folder-connected/plan.md` | Implementation plan |
| `docs/audit/0018-show-add-column-when-project-folder-connected/worklog.md` | Work log |
| `docs/audit/0018-show-add-column-when-project-folder-connected/changed-files.md` | This file |
| `docs/audit/0018-show-add-column-when-project-folder-connected/decisions.md` | Design/tech decisions |
| `docs/audit/0018-show-add-column-when-project-folder-connected/verification.md` | UI-only verification steps |

## Unchanged
- package.json, index.html, src/main.tsx, src/index.css, src/frontmatter.ts, vite.config.ts, tsconfig.*, .gitignore. Column remove/reorder and `hideRemove` behavior unchanged.
