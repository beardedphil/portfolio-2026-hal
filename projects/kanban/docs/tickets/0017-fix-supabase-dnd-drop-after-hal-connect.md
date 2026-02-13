# Ticket

- **ID**: `0017`
- **Title**: Fix Supabase ticket DnD drop after HAL connect (persist kanban updates)
- **Owner**: Implementation agent
- **Type**: Bug
- **Priority**: P0

## Linkage (for tracking)

- **Fixes**: `0013`
- **Category**: `DnD`

## Goal (one sentence)

Ensure Supabase-backed tickets can be dropped (persisted) after connecting via HAL’s folder-connect flow (and any other `connectSupabase(url,key)` path).

## Human-verifiable deliverable (UI-only)

A human can connect a project (Supabase) and then drag a ticket into a different column; after dropping, the ticket **stays** in the new column and the in-app diagnostics show the update succeeded (no console needed).

## Acceptance criteria (UI-only)

- [ ] When Supabase is connected via any UI flow (including HAL embedding), drag a ticket from **Unassigned** to **To-do** and drop:
  - the card appears in **To-do** immediately after drop, and
  - after the next poll/refresh, the card **remains** in **To-do** (no snap-back).
- [ ] In-app diagnostics (Debug panel / action log / error panel) provides a human-verifiable signal of persistence:
  - a log entry like “Supabase ticket \<id\> moved to \<column\>” on success, OR
  - a clear error message on failure (not just “failed”).
- [ ] Regression check: Supabase DnD still works when connecting via the existing non-HAL flow (whatever currently produces “Connected” state).

## Constraints

- Keep this task as small as possible while still producing a **human-verifiable** UI change.
- Verification must require **no external tools** (no terminal, no devtools, no console).
- Add/extend **in-app** diagnostics as needed so failures are explainable from within the app.

## Non-goals

- Changing database schema or RLS policies
- Adding real-time subscriptions (polling is fine)

## Implementation notes (optional)

- Hypothesis to validate/falsify: we “connect” and can list tickets, but the DnD update path does nothing because the update code reads Supabase URL/key from state that isn’t set by the HAL connect flow.
- If true, fix by ensuring the Supabase URL/key used for updates is always the same as the one used to fetch tickets (single source of truth).

## Audit artifacts required (implementation agent)

Create `docs/audit/0017-fix-supabase-dnd-drop-after-hal-connect/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)
