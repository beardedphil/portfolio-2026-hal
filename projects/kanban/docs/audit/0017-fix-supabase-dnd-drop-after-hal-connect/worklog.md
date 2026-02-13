# Work log (0017-fix-supabase-dnd-drop-after-hal-connect)

## Implementation
- **Root cause confirmed:** `connectSupabase(url, key)` saves to localStorage but never called `setSupabaseProjectUrl` or `setSupabaseAnonKey`. `updateSupabaseTicketKanban` and `refetchSupabaseTickets` read from those state variables, so when connecting via HAL postMessage or folder picker, the update path had empty url/key and silently failed (returned false, no persist).
- **Fix:** In `connectSupabase`, after setting tickets and connection status, add `setSupabaseProjectUrl(url)` and `setSupabaseAnonKey(key)` so the same credentials are used for fetches and updates.
- **Diagnostics:** Changed `updateSupabaseTicketKanban` return type from `Promise<boolean>` to `Promise<{ ok: true } | { ok: false; error: string }>`. On missing url/key, return `{ ok: false, error: 'Supabase not configured (URL/key missing). Connect first.' }`. On Supabase error or catch, return `{ ok: false, error: msg }`. Updated all three call sites in `handleDragEnd` to use `result.ok` and `result.error`; on failure, `addLog` now includes the error: e.g. `addLog(\`Supabase ticket ${id} move failed: ${result.error}\`)`. Success logs use "moved to" format per acceptance criteria.

## Git status when ready
- `git status -sb` (after push): `## main...origin/main`
