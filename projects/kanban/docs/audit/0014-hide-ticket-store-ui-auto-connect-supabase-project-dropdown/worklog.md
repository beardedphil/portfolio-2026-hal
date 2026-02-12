# Work log (0014-hide-ticket-store-ui-auto-connect-supabase-project-dropdown)

## Implementation
- Updated `.env.example`: added `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`; kept `SUPABASE_URL`/`SUPABASE_ANON_KEY` for scripts. Added `ImportMetaEnv` in `src/vite-env.d.ts` for the two Vite vars.
- Added constant `PROJECT_OPTIONS = [{ id: 'hal-kanban', label: 'hal-kanban' }]` and state `selectedProjectId` (default `PROJECT_OPTIONS[0].id`). Defaulted `ticketStoreMode` to `'supabase'`.
- Extracted Supabase connect logic into `connectSupabase(url, key)` callback (createClient, test query, fetch tickets, set state). Replaced `handleSupabaseConnect` body with a call to `connectSupabase(supabaseProjectUrl.trim(), supabaseAnonKey.trim())`.
- Removed useEffect that loaded Supabase config from localStorage. Added useEffect on mount: read `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from env; if both non-empty, set `supabaseProjectUrl`/`supabaseAnonKey` and call `connectSupabase(envUrl, envKey)`.
- Added env-derived values in render: `envUrl`, `envKey`, `supabaseConfigMissing`, `showConfigMissingError`. Added header bar with Project dropdown and connection status; added config-missing error block when `showConfigMissingError`.
- Removed entire Ticket Store section from main UI (Docs/Supabase tabs, connect form, ticket list, import/sync UI).
- Debug panel: in Ticket Store (Supabase) section, when `supabaseConfigMissing`, show "Missing env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY" (or which keys are missing).
- Added CSS in `index.css` for `.app-header-bar`, `.project-dropdown-wrap`, `.project-label`, `.project-select`, `.connection-status`, `.config-missing-error`.

## Verification
- With `.env` containing `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`: app loads, shows Project dropdown (hal-kanban) and connection status; auto-connects and board shows tickets.
- With env missing: main UI shows "Not connected: missing Supabase config"; Debug shows which env keys are missing.

## Git status when ready
- `git status -sb` (after push): `## main...origin/main`
