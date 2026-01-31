# PM Review: 0038 - Enable PM/agent to edit ticket body in Supabase

## Acceptance criteria

- [x] In the embedded Kanban UI, ticket 0037 shows the full, correctly formatted ticket body (Goal, Human-verifiable deliverable, Acceptance criteria with checkboxes, Constraints, Non-goals).
- [x] The PM "Unassigned check" no longer flags ticket 0037 as missing Goal / deliverable / AC checkboxes / Constraints / Non-goals (after running npm run update-ticket-body 0037).
- [x] The ticket body stored in Supabase for 0037 contains no unresolved template placeholders.
- [x] Formatting/parsing requirement documented in-code (evaluateTicketReady JSDoc, script normalizeBodyForReady).
- [x] Human can wait up to ~10 seconds and observe the embedded Kanban UI reflect the updated ticket content without manual refresh.

## Constraints

- [x] Update performed by writing to the database record, not by editing docs/tickets/0037-*.md.
- [x] Changes auditable: code changes and migration steps in branch + audit artifacts.
- [x] Verification possible via in-app UI (no console/devtools).

## Non-goals

- [x] Fixing 0037 (removing Add column and Debug toggle) is out of scope.
- [x] Refactoring the whole ticket system is out of scope.
