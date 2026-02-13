## Ticket

- **ID**: `0011`
- **Title**: Supabase Ticket Store v0 — in-app config, connect, and list tickets (read-only)
- **Owner**: Implementation agent
- **Type**: Feature
- **Priority**: P0

## Goal (one sentence)

Enable a hosted, multi-user-friendly source of truth by connecting the app to Supabase and listing tickets from the database (read-only).

## Human-verifiable deliverable (UI-only)

In the running app, a human can paste Supabase connection details into the UI, click Connect, and see a ticket list loaded from Supabase with clear in-app status and errors.

## Acceptance criteria (UI-only)

- [ ] The app has a **Ticket Store: Supabase** mode in the UI (alongside existing modes, if any).
- [ ] Selecting Supabase shows a **Supabase Config** panel with:
  - Project URL input
  - Anon key input
  - **Connect** button
  - Connection status (Disconnected / Connecting / Connected)
  - Last error (or “none”)
- [ ] Supabase config is stored locally (e.g., in-app “Saved locally” indicator) and is **not** committed to git.
- [ ] When connected successfully, the app displays:
  - **Found N tickets** count, and
  - a list of ticket titles/IDs sourced from Supabase (not from local demo data).
- [ ] Clicking a ticket shows a **Ticket Viewer** that displays the full ticket content (plain text is fine for v0).
- [ ] If the Supabase schema is missing (table not created yet), the UI shows:
  - a clear in-app message like **“Supabase not initialized”**, and
  - a **Setup instructions** area containing a copy/paste SQL block (see “Schema” below).
- [ ] The Debug panel includes a **Ticket Store (Supabase)** section showing:
  - Connected true/false
  - Project URL present true/false
  - Last refresh time
  - Last error

## Schema (required)

Use a minimal `tickets` table (single-project for now):

```sql
create table if not exists public.tickets (
  id text primary key,                 -- e.g. "0009"
  filename text not null,              -- e.g. "0009-docs-ticketstore-readonly-viewer.md"
  title text not null,
  body_md text not null,
  kanban_column_id text null,          -- e.g. "col-todo"
  kanban_position int null,            -- 0-based
  kanban_moved_at timestamptz null,
  updated_at timestamptz not null default now()
);
```

Notes:
- For v0, it’s acceptable to run with RLS disabled in dev; if RLS is enabled and blocks reads, the UI must show a clear in-app error.

## Constraints

- Keep this task as small as possible while still producing a **human-verifiable** UI change.
- Verification must require **no external tools** (no terminal, no devtools, no console).
- Do not add auth yet unless it is strictly required to make a read-only list work.
- Do not break the existing Docs Ticket Store; Supabase is an additional mode.

## Non-goals

- No create/edit/write-back to Supabase yet (read-only).
- No syncing Supabase tickets into kanban columns yet.
- No multi-project support yet.

## Implementation notes (optional)

- Prefer using `@supabase/supabase-js`.
- The Connect flow should include a “Test query” that verifies the table exists and is readable.
- Consider a simple mapping: store `body_md` as the full markdown file content.

## Audit artifacts required (implementation agent)

Create `docs/audit/0011-supabase-ticketstore-v0-connect-and-list/` containing:
- `plan.md`
- `worklog.md` (must include commit hash(es) + `git status -sb` output when ready)
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)
