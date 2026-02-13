---
kanbanColumnId: col-todo
kanbanPosition: 0
kanbanMovedAt: 2026-01-30T19:39:15.805Z
---
## Ticket

- **ID**: `0002`
- **Title**: Fix duplicate Action Log entries when toggling Debug
- **Owner**: Implementation agent
- **Type**: Bug
- **Priority**: P0

## Goal (one sentence)

Toggling the Debug button should create exactly one Action Log entry per click.

## Human-verifiable deliverable (UI-only)

In the running app, when a human clicks the Debug toggle repeatedly, the Action Log increases by **exactly one** entry per click (no duplicates).

## Acceptance criteria (UI-only)

- [ ] With Debug panel open, click the Debug toggle **5 times**; the Action Log shows **5 new entries** (not 10), and each entry corresponds to one click.
- [ ] The toggle still correctly shows/hides the Debug panel and flips the label between **Debug ON/OFF**.
- [ ] The Debug panel includes a visible count, e.g. **“Total actions: N”**, so a human can verify increments without manual counting.

## Constraints

- Keep this task as small as possible while still producing a **human-verifiable** UI change.
- Verification must require **no external tools** (no terminal, no devtools, no console).
- Add/extend **in-app** diagnostics as needed so failures are explainable from within the app.

## Non-goals

- Do not add ticket editing, kanban columns, drag-and-drop, routing, or persistence.

## Implementation notes (optional)

- Suspected cause: React dev **StrictMode** may invoke state updater functions twice; avoid side effects inside state updater callbacks.
- Likely fix: move logging to a place that won’t run twice per click (e.g., log based on stable next-state, or via an effect with an “ignore initial mount” guard).

## Audit artifacts required (implementation agent)

Create `docs/audit/0002-fix-debug-toggle-duplicate-action-log/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)
