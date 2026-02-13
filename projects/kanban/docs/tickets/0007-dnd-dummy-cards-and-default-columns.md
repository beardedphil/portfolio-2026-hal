## Ticket

- **ID**: `0007`
- **Title**: Kanban v0 — default columns + drag-and-drop dummy cards
- **Owner**: Implementation agent
- **Type**: Feature
- **Priority**: P0

## Goal (one sentence)

Start the board with three default columns and allow dummy cards to be dragged within and between columns.

## Human-verifiable deliverable (UI-only)

On first load, the app shows **To-do**, **Doing**, **Done** columns, each containing dummy cards; a human can drag a dummy card to reorder it within a column or move it to another column.

## Acceptance criteria (UI-only)

- [ ] On first load (without creating any columns), the board shows exactly 3 columns titled: **To-do**, **Doing**, **Done**.
- [ ] Each default column shows at least **3 dummy cards** with readable spacing.
- [ ] Dragging a dummy card **within the same column** changes its order immediately after drop.
- [ ] Dragging a dummy card **to a different column** moves it there immediately after drop.
- [ ] The Debug panel’s **Kanban state** shows, at minimum:
  - the **column order** (already present), and
  - a per-column list of **card titles in order** (e.g. `To-do: A,B,C | Doing: ... | Done: ...`)
  so a human can verify moves without external tools.
- [ ] The Action Log records:
  - a clear entry for card reorder within a column, and
  - a clear entry for moving a card between columns
  (include old location/order and new location/order in the message).

## Constraints

- Keep this task as small as possible while still producing a **human-verifiable** UI change.
- Verification must require **no external tools** (no terminal, no devtools, no console).
- Add/extend **in-app** diagnostics as needed so failures are explainable from within the app.

## Non-goals

- No real card creation yet (dummy cards only).
- No persistence yet.
- No swimlanes, labels, due dates, or other card metadata.

## Implementation notes (optional)

- This is only for dummy cards; data model can be minimal, but must represent cards belonging to a column and their order.
- Prefer to build on the existing `@dnd-kit` setup to support multiple droppable containers (columns).

## Audit artifacts required (implementation agent)

Create `docs/audit/0007-dnd-dummy-cards-and-default-columns/` containing:
- `plan.md`
- `worklog.md` (must include commit hash(es) + `git status -sb` output when ready)
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)
