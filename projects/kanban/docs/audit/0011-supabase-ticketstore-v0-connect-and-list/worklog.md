# Work log (0011-supabase-ticketstore-v0-connect-and-list)

## Summary
- Added Ticket Store mode: Docs | Supabase.
- Supabase mode: config panel (Project URL, Anon key, Connect), connection status, last error, "Saved locally" when config in localStorage.
- Connect flow: test query to verify table exists; on success fetch tickets and show list + Ticket Viewer; on missing table show "Supabase not initialized" and setup SQL.
- Debug panel: Ticket Store (Supabase) section.

## Commit and status
- **Commit hash:** 13f1e61
- **git status -sb:** `## main...origin/main` (pushed)
