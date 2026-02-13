# Plan (0017-fix-supabase-dnd-drop-after-hal-connect)

## Goal
Ensure Supabase-backed tickets can be dropped (persisted) after connecting via HAL's folder-connect flow (and any other `connectSupabase(url, key)` path).

## Deliverable (UI-only)
A human can connect a project (Supabase) and then drag a ticket into a different column; after dropping, the ticket stays in the new column and the in-app diagnostics show the update succeeded (no console needed).

## Hypothesis (from ticket)
We "connect" and can list tickets, but the DnD update path does nothing because the update code reads Supabase URL/key from state that isn't set by the HAL connect flow.

## Steps

1. **Root cause**
   - Confirm that `updateSupabaseTicketKanban` and `refetchSupabaseTickets` use `supabaseProjectUrl` and `supabaseAnonKey` from React state.
   - Confirm that `connectSupabase(url, key)` does not set these state variables when called (e.g. from HAL postMessage or folder picker flow).

2. **Single source of truth**
   - In `connectSupabase`, after successful connection, call `setSupabaseProjectUrl(url)` and `setSupabaseAnonKey(key)` so that any subsequent updates/refetches use the same credentials.

3. **In-app diagnostics**
   - Enhance `updateSupabaseTicketKanban` to return error message on failure.
   - Update action log entries to include the actual error when DnD update fails (not just "failed").
   - Keep success log format: "Supabase ticket \<id\> moved to \<column\>".

4. **Audit**
   - Create `docs/audit/0017-fix-supabase-dnd-drop-after-hal-connect/` with plan, worklog, changed-files, decisions, verification.

## Out of scope
- Changing database schema or RLS policies.
- Adding real-time subscriptions (polling is fine).
