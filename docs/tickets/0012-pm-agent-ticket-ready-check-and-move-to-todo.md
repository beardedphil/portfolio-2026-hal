# Ticket

- **ID**: `0012`
- **Title**: PM agent: “ready-to-start” check + move any ticket to To Do
- **Owner**: Implementation agent
- **Type**: Feature
- **Priority**: P0

## Linkage (for tracking)

- **Fixes**: (n/a)
- **Category**: Process

## Goal (one sentence)

Formalize “ready-to-start” rules for moving a ticket into **To Do**, and enable the PM agent to run that gate and move **any** ticket (whether or not it authored it) from Unassigned into To Do.

## Human-verifiable deliverable (UI-only)

A human can pick a ticket currently in **Unassigned**, ask the PM to “move this to To Do”, and the PM will either:
- refuse with a clear checklist of what’s missing, or
- confirm it passes the gate and move it into **To Do** on the kanban board.

## Acceptance criteria (UI-only)

- [ ] There is a documented “Ready-to-start” checklist (Definition of Ready) for moving tickets into **To Do**.
  - [ ] The checklist is referenced by the PM agent and is visible in the repo (e.g. `docs/process/...` and/or `.cursor/rules/...`).
- [ ] The PM agent can evaluate readiness for **any** ticket in Unassigned (not only tickets it authored):
  - [ ] It can fetch the ticket body needed for evaluation (from repo markdown and/or from Supabase/kanban record).
- [ ] When asked to move a ticket to To Do:
  - [ ] If not ready, PM does **not** move it and provides a clear missing-items list.
  - [ ] If ready, PM moves it into **To Do** and confirms in chat.
- [ ] The move is visible on the kanban board (ticket leaves Unassigned and appears under To Do).
- [ ] Diagnostics shows:
  - [ ] the readiness decision (pass/fail + reasons),
  - [ ] the kanban mutation performed (ticket id, from column, to column),
  - [ ] any tool calls used to fetch ticket content.

## Constraints

- Keep this task as small as possible while still producing a **human-verifiable** UI change.
- Verification must require **no external tools** (no terminal, no devtools, no console).
- Must work even if the ticket was created outside the PM (e.g. manually written + synced, or existing in Supabase).
- Avoid “magic” moves: the PM must always run the readiness gate before moving.

## Non-goals

- Full “ready for verification / done means pushed” gate (that’s later in the workflow).
- Automatically writing missing parts of a ticket unless explicitly requested (PM can suggest edits, but auto-edit is out of scope unless separately ticketed).

## Implementation notes (optional)

- Define Ready-to-start as a minimal, auditable checklist derived from the ticket template:
  - Goal present
  - Human-verifiable deliverable present
  - Acceptance criteria checkboxes present
  - Constraints + non-goals present
  - No obvious placeholders (e.g. `<AC 1>`)
- Implement a kanban mutation tool (`kanban_move_ticket_to_todo(ticketId)`) and a content-fetch tool for tickets.

## Audit artifacts required (implementation agent)

Create `docs/audit/0012-pm-agent-ticket-ready-check-and-move-to-todo/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)
- `pm-review.md`

