## Ticket

- **ID**: `0016`
- **Title**: Layout polish — widen board area and remove “Columns” heading
- **Owner**: Implementation agent
- **Type**: Bug
- **Priority**: P0

## Linkage (for tracking)

- **Fixes**: `0014`
- **Category**: CSS

## Goal (one sentence)

Make the kanban board use the available width (so multiple columns fit) and remove the redundant “Columns” title.

## Human-verifiable deliverable (UI-only)

On the main screen, the board is no longer constrained to a narrow centered column; columns have enough horizontal space to show at least 4 columns comfortably, and the “Columns” heading is not shown.

## Acceptance criteria (UI-only)

- [ ] The page content is no longer constrained to a narrow middle strip; the board uses most of the viewport width (reasonable margins are fine).
- [ ] With Project = `hal-kanban`, the visible board can show **at least 4 columns worth of space** without feeling cramped (even if you still scroll horizontally on very small screens).
- [ ] The “Columns” heading/title is removed from the UI (the board still renders columns and cards normally).
- [ ] Drag-and-drop continues to work (no regression).
- [ ] Debug panel still works (no regression).

## Constraints

- Keep this task as small as possible while still producing a **human-verifiable** UI change.
- Verification must require **no external tools** (no terminal, no devtools, no console).
- No unrelated redesign; only spacing/layout and removing the heading.

## Implementation notes (optional)

- The narrow middle layout is likely driven by `#root { max-width: 640px; margin: 0 auto; }` in `src/index.css`.
  - Consider increasing/removing max-width for the app container or introducing a wider layout for the board section.
- Removing “Columns” likely means removing or hiding the `<h2>Columns</h2>` in the board section.

## Audit artifacts required (implementation agent)

Create `docs/audit/0016-widen-board-remove-columns-heading/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)
