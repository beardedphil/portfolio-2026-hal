# PM review: 0034 - Meta: Investigate why PM agent-created tickets are not "ready"

## Deliverable

Root cause fixed: the PM agent now receives the full ticket template in context and stricter create_ticket instructions, so newly created tickets are populated with concrete content and no unresolved placeholders. When a created ticket is not ready, the tool output and chat reply provide an in-app diagnostic (missing items) without requiring the console.

## Acceptance criteria

- [ ] Creating a new ticket via chat results in a ticket that contains a non-placeholder Goal, Deliverable, Constraints, and Non-goals sections.
- [ ] The created ticket contains Acceptance Criteria checkboxes (`- [ ] ...`).
- [ ] The created ticket contains **no** unresolved template placeholders (e.g. no task-id, short-title, or other angle-bracket tokens).
- [ ] The PM "Unassigned check" (or equivalent in-app readiness validation) does **not** report the newly created ticket as "Not ready" for missing sections/placeholders.
- [ ] If ticket creation fails to populate required fields, the UI shows an in-app diagnostic explaining what was missing and why (no console required).

## Constraints

- Follows `docs/templates/ticket.template.md` as the single source of truth for required ticket sections.
- Aligns with `docs/process/ready-to-start-checklist.md` and the `evaluate_ticket_ready` behavior.
- No devtools/console required for verification; in-app diagnostics used.
- No unrelated ticket template changes; template and checklist unchanged.

## Non-goals

- Fixing the content of existing not-ready tickets individually (except as test fixtures).
- Redesigning the entire Kanban UI.
