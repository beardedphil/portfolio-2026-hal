# Changed files (0011-supabase-ticketstore-v0-connect-and-list)

## Modified

| Path | Change |
|------|--------|
| `package.json` | Added dependency `@supabase/supabase-js`. |
| `src/App.tsx` | Import createClient. Types: SupabaseTicketRow; constants SUPABASE_CONFIG_KEY, SUPABASE_SETUP_SQL. State: ticketStoreMode, supabaseProjectUrl, supabaseAnonKey, supabaseConnectionStatus, supabaseLastError, supabaseTickets, supabaseLastRefresh, supabaseNotInitialized, selectedSupabaseTicketId, selectedSupabaseTicketContent. useEffect: load Supabase config from localStorage. handleSupabaseConnect: test query then fetch tickets or set notInitialized; persist config to localStorage. handleSelectSupabaseTicket. Ticket Store section: mode tabs (Docs / Supabase). Docs mode: existing UI unchanged. Supabase mode: Supabase Config panel (URL, anon key, Connect, status, last error, Saved locally); setup instructions + SQL when not initialized; when connected: Found N tickets, list, Ticket Viewer. Debug: new section "Ticket Store (Supabase)" (Connected, Project URL present, Last refresh time, Last error). |
| `src/index.css` | .ticket-store-mode, .mode-tab, .mode-tab.active; .tickets-docs-section h3; .supabase-config, .supabase-config label/input; .supabase-setup, .supabase-setup-sql; .tickets-status[data-status='connecting']. |

## Created

| Path | Purpose |
|------|---------|
| `docs/audit/0011-supabase-ticketstore-v0-connect-and-list/plan.md` | Implementation plan |
| `docs/audit/0011-supabase-ticketstore-v0-connect-and-list/worklog.md` | Work log (commit hash + git status when ready) |
| `docs/audit/0011-supabase-ticketstore-v0-connect-and-list/changed-files.md` | This file |
| `docs/audit/0011-supabase-ticketstore-v0-connect-and-list/decisions.md` | Design/tech decisions |
| `docs/audit/0011-supabase-ticketstore-v0-connect-and-list/verification.md` | UI-only verification steps |

## Unchanged
- index.html, src/main.tsx, src/frontmatter.ts, vite.config.ts, tsconfig.*, .gitignore (config is in localStorage only).
