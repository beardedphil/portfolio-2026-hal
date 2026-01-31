# Ready-to-start checklist (Definition of Ready)

A ticket is **ready to start** when it can be moved from **Unassigned** into **To Do**. The PM agent uses this checklist before moving any ticket. A human can also use it to self-check.

## Checklist (all must pass)

1. **Goal present** — The ticket has a "Goal (one sentence)" section with a non-empty, meaningful sentence (not a placeholder like `<what we want to achieve>`).

2. **Human-verifiable deliverable present** — The ticket has a "Human-verifiable deliverable (UI-only)" section with a concrete description of what a non-technical human will see or do (not a placeholder like `<Describe exactly...>`).

3. **Acceptance criteria checkboxes present** — The ticket has an "Acceptance criteria (UI-only)" section with at least one checkbox line (e.g. `- [ ] <AC 1>`). The content of each item may be a placeholder initially, but the structure must exist.

4. **Constraints + Non-goals present** — The ticket has both "Constraints" and "Non-goals" sections with at least one bullet or line each (not empty and not only placeholders).

5. **No obvious placeholders** — The ticket body does not contain unresolved template placeholders such as `<AC 1>`, `<task-id>`, `<short title>`, `<what we want to achieve>`, or similar angle-bracket placeholders that indicate "fill this in later."

## Reference

- Ticket template: `docs/templates/ticket.template.md`
- PM agent: uses this checklist via the `evaluate_ticket_ready` tool before calling `kanban_move_ticket_to_todo`.
