---
kanbanColumnId: col-done
kanbanPosition: 0
kanbanMovedAt: 2026-02-01T17:12:33.86+00:00
---
# Title
Enable PM/agent to edit ticket body in Supabase so 0037 passes Definition of Ready

## Owner
Unassigned

## Type
Process

## Priority
P1

## Goal (one sentence)
Allow a Cursor implementation agent to update ticket **0037** directly in the **Supabase/kanban database** so the PM “Unassigned check” (Definition of Ready) stops failing for 0037.

## Human-verifiable deliverable (UI-only)
A human can open the embedded Kanban UI, view ticket **0037**, and see that its ticket details include non-empty **Goal**, **Human-verifiable deliverable**, **Acceptance criteria** (with checkboxes), **Constraints**, and **Non-goals**, and the PM “Unassigned check” no longer reports those sections as missing for 0037.

## Acceptance criteria (UI-only)
- [ ] In the embedded Kanban UI, ticket **0037** shows the full, correctly formatted ticket body (includes the required headings/sections: Goal, Human-verifiable deliverable, Acceptance criteria with checkboxes, Constraints, Non-goals).
- [ ] The PM “Unassigned check” (Definition of Ready) no longer flags ticket **0037** as missing Goal / deliverable / AC checkboxes / Constraints / Non-goals.
- [ ] The ticket body stored in Supabase for 0037 contains **no** unresolved template placeholders like `<task-id>`, `<short-title>`, `<AC 1>`, etc.
- [ ] If there is a formatting/parsing requirement (exact heading text, markdown structure), it is documented in-code (comment or function docs) so future ticket edits do not break readiness evaluation.
- [ ] A human can wait up to ~10 seconds (poll interval) and observe the embedded Kanban UI reflect the updated ticket content without a manual refresh.

## Constraints
- Do **not** rely on editing `docs/tickets/0037-*.md` for the fix; the update must be performed by writing to the **database record** that the embedded Kanban UI reads.
- Changes must be auditable: include code changes (if any) and any migration/seed steps as part of the ticket’s branch + audit artifacts.
- Do not introduce a workflow that requires console/devtools for verification; verification should be possible via in-app UI.

## Non-goals
- Fixing the underlying feature request in 0037 (removing “Add column” and “Debug OFF”) is out of scope here.
- Refactoring the whole ticket system or changing the ticket template is out of scope unless required to make the DB update path reliable.

## Motto
Project Managers rule, implementers drool.