---
kanbanColumnId: col-done
kanbanPosition: 11
kanbanMovedAt: 2026-01-31T17:58:53.251+00:00
---
# Ticket

- **ID**: `0019`
- **Title**: Remove redundant “Connected” label next to Connect Project Folder
- **Owner**: Implementation agent
- **Type**: Bug
- **Priority**: P2

## Linkage (for tracking)

- **Fixes**: `0010`
- **Category**: `CSS`

## Goal (one sentence)

Remove the redundant “Connected” label next to the **Connect Project Folder** control to reduce UI clutter while keeping connection state clear elsewhere in the UI.

## Background

An agent response claimed to create `0018-remove-connected-label-next-to-connect-project-folder.md`, but no such file exists in `portfolio-2026-hal/docs/tickets/`. There is already a `0018` ticket in the Kanban subproject (`projects/kanban/docs/tickets/0018-...`), so we are using the next globally-unique ID (`0019`) for the HAL repo ticket.

## Human-verifiable deliverable (UI-only)

A human can connect a project folder and see that the Connect button area no longer shows a redundant “Connected” label, while connection status remains understandable via existing diagnostics/connected project display.

## Acceptance criteria (UI-only)

- [ ] On the main HAL UI, locate the **Connect Project Folder** control.
- [ ] When **not connected**, the UI looks unchanged (no new labels or spacing regressions).
- [ ] When a project folder **is connected**, the redundant “Connected” label next to the connect control is **not shown**.
- [ ] Connection state is still clear:
  - [ ] Diagnostics “Connected project:” shows the project name (or equivalent existing indicator still works).
- [ ] Basic smoke:
  - [ ] Disconnect still works.
  - [ ] No layout shift overlaps or misaligned buttons in the header area (desktop width).

## Constraints

- Keep this task minimal: remove only the redundant label, avoid unrelated styling changes.
- Verification must require **no external tools** (no terminal, no devtools, no console).

## Non-goals

- Redesigning the connect/disconnect UI.
- Changing project connection logic or persistence behavior.

## Audit artifacts required (implementation agent)

Create `docs/audit/0019-remove-connected-label-next-to-connect-project-folder/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)
- `pm-review.md`

