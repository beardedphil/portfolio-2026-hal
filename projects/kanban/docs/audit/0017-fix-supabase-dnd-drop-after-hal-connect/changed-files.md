# Changed files (0017-fix-supabase-dnd-drop-after-hal-connect)

## Modified

| Path | Change |
|------|--------|
| `src/App.tsx` | In `connectSupabase`: after successful connect, call `setSupabaseProjectUrl(url)` and `setSupabaseAnonKey(key)` so update/refetch use the same credentials. `updateSupabaseTicketKanban`: return type `Promise<{ ok: true } \| { ok: false; error: string }>`; on missing url/key return clear error; on Supabase error or catch, return error message. All three `handleDragEnd` call sites: use `result.ok` / `result.error`; on failure, `addLog` includes error text (e.g. "Supabase ticket X move failed: \<error\>"); success logs "moved to" format. |

## Created

| Path | Purpose |
|------|---------|
| `docs/audit/0017-fix-supabase-dnd-drop-after-hal-connect/plan.md` | Implementation plan |
| `docs/audit/0017-fix-supabase-dnd-drop-after-hal-connect/worklog.md` | Work log |
| `docs/audit/0017-fix-supabase-dnd-drop-after-hal-connect/changed-files.md` | This file |
| `docs/audit/0017-fix-supabase-dnd-drop-after-hal-connect/decisions.md` | Design/tech decisions |
| `docs/audit/0017-fix-supabase-dnd-drop-after-hal-connect/verification.md` | UI-only verification steps |

## Unchanged
- package.json, index.html, src/main.tsx, src/frontmatter.ts, src/index.css, vite.config.ts, tsconfig.*, .gitignore.
