---
kanbanColumnId: col-human-in-the-loop
kanbanPosition: 0
kanbanMovedAt: 2026-01-31T22:00:00.000Z
---
# Title
Kanban: click ticket card opens styled details modal (avoid conflict with drag)

# Owner
PM

# Type
Feature

# Priority
P1

# Linkage
- Related UX context: embedded Kanban board ticket interaction patterns
- Related: ticket movement/drag interactions (see `docs/tickets/0031-kanban-allow-agents-to-move-tickets-between-controlled-columns-doingready-for-qadonewont-implement.md`)

## Goal (one sentence)
Make it easy to read a ticket’s full contents by clicking a card to open a well-styled modal, without accidental opens during drag-and-drop.

## Human-verifiable deliverable (UI-only)
In the embedded Kanban UI, a human can click a ticket card to open a modal that shows the full ticket contents (rendered clearly with headings, lists, and links), and can still drag tickets between columns without the modal popping open accidentally.

## Acceptance criteria (UI-only)
- [ ] Clicking a ticket card (without dragging) opens a modal showing the ticket’s full content.
- [ ] The modal presents content in a readable, “designed” layout (clear title, metadata like ID/priority if available, readable markdown, good spacing, scroll within modal for long tickets).
- [ ] The modal has an obvious close affordance (e.g., X button) and supports closing via Escape and clicking the backdrop.
- [ ] While the modal is open, background scrolling is prevented and focus is trapped in the modal (basic accessibility).
- [ ] Dragging a ticket card between columns does **not** open the modal.
- [ ] If the user starts a drag gesture (pointer down + move beyond threshold), the click-to-open is canceled.
- [ ] On touch/trackpad, the interaction does not make it easy to accidentally trigger the wrong action (define and implement a clear rule such as a drag-handle area, long-press to drag, or minimum-move threshold).
- [ ] If ticket content fails to load, the modal shows an in-app error state (not console-only) and provides a way to retry/close.

## Constraints
- Scope: embedded Kanban UI (`projects/kanban/`).
- Keep DnD behavior intact; no regressions to moving tickets.
- UI-only verification; do not rely on devtools/console.

## Non-goals
- Full markdown editor for tickets.
- Changing ticket schema or adding new ticket fields beyond what’s required to display existing content.
- Implementing comments, history, or @mentions inside tickets.

# Implementation notes
- Consider using a dedicated drag handle region on the card (recommended) so click-to-open is unambiguous.
- Alternatively (or additionally), implement a drag threshold: only treat as click if pointer up occurs without exceeding movement threshold.
- Ensure ticket body rendering is safe and consistent with existing markdown rendering approach in this repo.

# History
- PM cleanup for DoR (0036).

## QA (implementation agent fills when work is pushed)
- **Branch**: `ticket/0033-kanban-click-ticket-card-opens-styled-details-modal-avoid-conflict-with-drag` — QA performs code review + automated verification (no manual UI testing). When satisfied, QA merges to `main` and moves the ticket to **Human in the Loop**.

# Audit artifacts
- Standard audit artifacts under `docs/audit/0033-kanban-click-ticket-card-opens-styled-details-modal-avoid-conflict-with-drag/` (plan, worklog, changed-files, decisions, verification, pm-review).