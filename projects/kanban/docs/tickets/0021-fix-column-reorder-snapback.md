# Ticket

- **ID**: `0021`
- **Title**: Fix column reorder snap-back on drop
- **Owner**: Implementation agent
- **Type**: Bug
- **Priority**: P0

## Linkage (for tracking)

- **Fixes**: `0004`
- **Category**: `DnD`

## Goal (one sentence)

When a user drags a column to reorder it, the new order should persist in UI (no snap-back on drop).

## Human-verifiable deliverable (UI-only)

A human can drag a column header left/right to reorder columns, drop it, and the column stays in the new position (including after a refresh/poll if applicable).

## Acceptance criteria (UI-only)

- [ ] In a mode where column reordering is allowed (not the fixed Supabase-columns mode), drag a column to a new position and drop.
- [ ] The column order updates immediately and **does not snap back** after drop.
- [ ] Basic smoke: card DnD still works and does not regress.
- [ ] If column order is persisted in the current mode (e.g. docs ticket store or future Supabase columns), refresh/poll and confirm the order remains.
- [ ] In-app diagnostics (Debug / Action Log) includes a clear entry confirming reorder (or a clear error if persistence fails).

## Constraints

- Keep this task as small as possible while still producing a **human-verifiable** UI change.
- Verification must require **no external tools** (no terminal, no devtools, no console).
  - Starting the dev server is acceptable if unavoidable, but verification after startup should be browser-only.
- Add/extend **in-app** diagnostics as needed so failures are explainable from within the app.

## Non-goals

- Implementing a full columns persistence model (handled separately by `0020` for Supabase mode)

## Implementation notes (optional)

- “Snap back” usually means the DnD handler computes a new order but the render source-of-truth doesn’t update (or a subsequent state recompute overwrites it).
- Confirm which column list is authoritative for the current mode:
  - local columns vs Ticket Store columns vs Supabase columns.
- Ensure `SortableContext` `items` matches the same source-of-truth list that `setCols` updates on drop.
- Process note: keep follow-up commits for this work labeled with `0021` in the subject for traceability.

## Audit artifacts required (implementation agent)

Create `docs/audit/0021-fix-column-reorder-snapback/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)
