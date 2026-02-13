## Ticket

- **ID**: `0012`
- **Title**: Supabase Ticket Store v1 — import `docs/tickets/*.md` into Supabase (UI-only, idempotent)
- **Owner**: Implementation agent
- **Type**: Feature
- **Priority**: P0

## Goal (one sentence)

Allow importing all local `docs/tickets/*.md` into Supabase from within the app, with a preview and a repeatable (idempotent) upsert.

## Human-verifiable deliverable (UI-only)

In the running app, a human can connect to Supabase, connect to a project folder, preview which tickets will be created/updated/skipped, run the import, and then see the tickets listed from Supabase.

## Acceptance criteria (UI-only)

- [ ] In **Supabase Ticket Store** mode, there is an **Import from Docs** section.
- [ ] The import section requires:
  - Supabase Connected = true
  - Docs project folder Connected = true
  If either is missing, the UI shows a clear in-app message telling the human what to connect first.
- [ ] Clicking **Preview import** scans `docs/tickets/*.md` and shows:
  - totals: **Found N**, **Will create X**, **Will update Y**, **Will skip Z**, **Will fail W**
  - a scrollable list showing each filename and its planned action (create/update/skip/fail) with a reason for skip/fail.
- [ ] Clicking **Import** performs an idempotent upsert into Supabase `tickets`:
  - Uses `id` (4-digit ticket ID) as primary key.
  - Stores at minimum: `id`, `filename`, `title`, `body_md`, and the kanban fields (if present).
  - Shows progress and final summary in-app (no console).
- [ ] After import completes, the Supabase ticket list shows the imported tickets and the count matches the import summary.
- [ ] Re-running **Import** immediately (no file changes) results in **0 creates**, **0 updates**, and a non-zero **skips** count (or equivalent “unchanged” status) — i.e., no duplication.
- [ ] If any write fails (RLS, invalid key, missing table), the UI shows a clear in-app error and the Debug panel records the last import error.

## Data mapping rules (required)

- **id**: first 4 digits from filename (e.g. `0009-...md` → `0009`). If missing/invalid → fail that file with reason.
- **filename**: the filename (e.g. `0009-docs-ticketstore-readonly-viewer.md`)
- **title**: best-effort extract:
  - If file contains `- **Title**: ...` use that
  - Else use filename without `.md`
- **body_md**: full markdown file text (including frontmatter)
- **kanban_column_id / kanban_position / kanban_moved_at**:
  - Read from YAML frontmatter keys `kanbanColumnId`, `kanbanPosition`, `kanbanMovedAt` if present.

## Constraints

- Keep this task as small as possible while still producing a **human-verifiable** UI change.
- Verification must require **no external tools** (no terminal, no devtools, no console).
- No destructive behavior by default:
  - do not delete DB rows
  - do not overwrite unless the ticket is newer/different (use a simple “content changed” check)

## Non-goals

- No export from Supabase back to docs yet.
- No multi-project namespaces yet.
- No auth/roles beyond what’s required for the import to function in dev.

## Implementation notes (optional)

- Prefer a deterministic “changed” check:
  - compare `body_md` in DB to file text (or store a `source_hash` and compare).
- If table missing, display the SQL setup instructions already defined in `0011`.

## Audit artifacts required (implementation agent)

Create `docs/audit/0012-supabase-import-tickets-from-docs/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)
