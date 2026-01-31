# Ticket

- **ID**: `0011`
- **Title**: PM agent: create ticket into Unassigned from chat
- **Owner**: Implementation agent
- **Type**: Feature
- **Priority**: P0

## Linkage (for tracking)

- **Fixes**: (n/a)
- **Category**: (n/a)

## Goal (one sentence)

Allow the user to have a back-and-forth PM conversation and, when ready, have the PM agent create a new ticket that appears in the Kanban **Unassigned** column.

## Human-verifiable deliverable (UI-only)

A human can chat with the PM, then click a single “Create ticket” action (or send a clear command like “create ticket”) and see a new ticket appear in the kanban board under **Unassigned**, with the PM-generated title/body and a new ticket ID.

## Acceptance criteria (UI-only)

- [ ] With a project connected, a human can converse with the PM for multiple messages and then trigger ticket creation (UI button or clear chat command).
- [ ] The PM agent produces a ticket that meets the repo’s ticket template basics:
  - [ ] has an ID, title, goal, deliverable, acceptance criteria, constraints, non-goals
  - [ ] is written to the correct repo location (HAL `docs/tickets/` unless the connected project is a different target repo)
- [ ] The new ticket appears in the kanban board in **Unassigned** without manual refresh steps (within normal poll interval is fine).
- [ ] Diagnostics shows what happened:
  - [ ] the outbound OpenAI request JSON used to draft the ticket (redacted)
  - [ ] the exact file path created/modified for the ticket
  - [ ] the ticket ID that was created
  - [ ] any sync operation status (success/error)
- [ ] The PM agent does **not** move the ticket out of Unassigned in this ticket (that is ticket 0012).

## Constraints

- Keep this task as small as possible while still producing a **human-verifiable** UI change.
- Verification must require **no external tools** (no terminal, no devtools, no console).
- Ticket creation should be deterministic and safe:
  - Avoid overwriting existing ticket IDs.
  - Never write secrets into ticket bodies.
- After writing a ticket file under `docs/tickets/`, ensure it is synced into Supabase/kanban (existing `sync-tickets` mechanism or equivalent) so it appears on the board.

## Non-goals

- Full “ready for verification” completion; this is just creating a ticket and getting it into Unassigned.
- Kanban mutations beyond creation (moving tickets, creating columns, etc.).

## Implementation notes (optional)

- Likely needs PM agent **write tools** (file create + run ticket sync) and a small UI affordance to trigger ticket creation explicitly.
- Define the ticket target repo policy (default to HAL repo unless user selects otherwise).

## Audit artifacts required (implementation agent)

Create `docs/audit/0011-pm-agent-create-ticket-into-unassigned-from-chat/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)
- `pm-review.md`

