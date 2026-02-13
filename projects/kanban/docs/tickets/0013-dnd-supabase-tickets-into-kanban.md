## Ticket

- **ID**: `0013`
- **Title**: Kanban ↔ Supabase tickets v0 — drag Supabase tickets into columns (polling-friendly)
- **Owner**: Implementation agent
- **Type**: Feature
- **Priority**: P0

## Goal (one sentence)

Make Supabase-backed tickets draggable into kanban columns (and between them) so the board remains usable after the docs→Supabase migration.

## Human-verifiable deliverable (UI-only)

When Ticket Store is set to Supabase, a human can drag a ticket from the Supabase ticket list into To-do/Doing/Done, and the ticket stays there after refresh/polling.

## Acceptance criteria (UI-only)

- [ ] With Ticket Store = **Supabase** and connected, the UI shows a Supabase ticket list where each ticket is draggable.
- [ ] Dragging a Supabase ticket into **To-do** creates/moves the corresponding kanban card into To-do immediately after drop.
- [ ] Dragging the same ticket **To-do → Doing** moves it and it stays there.
- [ ] Reordering two Supabase tickets within the same column persists after drop.
- [ ] The Debug panel shows:
  - current polling interval (or “polling off”)
  - last poll time
  - last poll error (or none)
  - per-column ticket order (IDs in order) so a human can verify without external tools.
- [ ] After a page refresh, the ticket placements and ordering load from Supabase (no reliance on local docs frontmatter).

## Constraints

- Keep this task as small as possible while still producing a **human-verifiable** UI change.
- Verification must require **no external tools** (no terminal, no devtools, no console).
- Use **polling** (not realtime) for updates; keep the interval modest (e.g. 5–15s) and visible in the UI/Debug.

## Non-goals

- No docs ticket dragging in this ticket (Supabase mode only).
- No multi-project support yet.

## Implementation notes (optional)

- Store kanban placement in Supabase columns `kanban_column_id`, `kanban_position`, `kanban_moved_at`.
- Prefer idempotent updates:
  - moving a ticket updates its `kanban_column_id` and `kanban_moved_at`
  - reordering updates `kanban_position` for affected tickets in that column

## Audit artifacts required (implementation agent)

Create `docs/audit/0013-dnd-supabase-tickets-into-kanban/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)
