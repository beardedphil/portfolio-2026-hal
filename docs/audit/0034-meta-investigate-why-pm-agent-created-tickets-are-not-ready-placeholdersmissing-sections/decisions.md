# Decisions: 0034 - Meta: Investigate why PM agent-created tickets are not "ready"

## Inject ticket template into context pack

**Decision**: Include the full content of `docs/templates/ticket.template.md` in the PM agent context pack, in a section "Ticket template (required structure for create_ticket)", with an explicit instruction to replace every angle-bracket placeholder with concrete content so the ticket passes the Ready-to-start checklist.

**Rationale**: The model was told to "follow the repo ticket template" but never saw the template. Including it gives the model the exact section headings and placeholder syntax, reducing hallucinated placeholders and missing sections.

## Evaluate readiness at creation time

**Decision**: After a successful create_ticket insert, run `evaluateTicketReady(input.body_md)` and add `ready` and `missingItems` to the tool success output. Do not block creation when not ready; still create the ticket and surface the diagnostic.

**Rationale**: Ticket AC requires "If ticket creation fails to populate required fields, the UI shows an in-app diagnostic explaining what was missing and why." Returning readiness in the tool output lets Diagnostics and the model reply show missing items immediately, without requiring the user to wait for the Unassigned check or open the console.

## No template file changes

**Decision**: Do not modify `docs/templates/ticket.template.md` or `docs/process/ready-to-start-checklist.md`. The fix is to make the creation flow supply the model with the template and stricter instructions; the checklist and validator remain the single source of truth.

**Rationale**: Ticket constraints: "Must follow docs/templates/ticket.template.md as the single source of truth" and "Do not introduce unrelated ticket template changes unless required."
