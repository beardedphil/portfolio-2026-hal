# Changed files (0014-hide-ticket-store-ui-auto-connect-supabase-project-dropdown)

## Modified

| Path | Change |
|------|--------|
| `.env.example` | Added `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`; noted frontend vs scripts usage; kept `SUPABASE_URL`/`SUPABASE_ANON_KEY` for scripts. |
| `src/vite-env.d.ts` | Extended `ImportMetaEnv` with `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. |
| `src/App.tsx` | Added `PROJECT_OPTIONS`, `selectedProjectId` state; defaulted `ticketStoreMode` to `'supabase'`. Extracted `connectSupabase(url, key)`; replaced localStorage load with auto-connect effect from env. Added header bar (project dropdown + connection status), config-missing error block. Removed entire Ticket Store section from main UI. Debug: show missing env keys when `supabaseConfigMissing`. |
| `src/index.css` | Added styles for `.app-header-bar`, `.project-dropdown-wrap`, `.project-label`, `.project-select`, `.connection-status`, `.config-missing-error`. |

## Created

| Path | Purpose |
|------|---------|
| `docs/audit/0014-hide-ticket-store-ui-auto-connect-supabase-project-dropdown/plan.md` | Implementation plan |
| `docs/audit/0014-hide-ticket-store-ui-auto-connect-supabase-project-dropdown/worklog.md` | Work log |
| `docs/audit/0014-hide-ticket-store-ui-auto-connect-supabase-project-dropdown/changed-files.md` | This file |
| `docs/audit/0014-hide-ticket-store-ui-auto-connect-supabase-project-dropdown/decisions.md` | Design/tech decisions |
| `docs/audit/0014-hide-ticket-store-ui-auto-connect-supabase-project-dropdown/verification.md` | UI-only verification steps |

## Unchanged
- package.json, index.html, src/main.tsx, src/frontmatter.ts, vite.config.ts, tsconfig.*, .gitignore. Ticket Store–related state and handlers (e.g. handleConnectProject, handleSupabaseConnect) remain in App.tsx for possible Debug-only use or future tickets; not removed to keep change minimal.
