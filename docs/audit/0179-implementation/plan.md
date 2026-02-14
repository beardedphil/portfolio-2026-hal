# Plan for ticket 0179

## Approach

1. **Update ticket template** (`docs/templates/ticket.template.md`):
   - Add a clear "Ticket template (copy/paste)" section at the top
   - Include required sections list (Goal, Human-verifiable deliverable, Acceptance criteria, Constraints, Non-goals)
   - Add critical requirements section with:
     - Checkbox format requirement for AC
     - UI-verifiability requirement (with explicit examples of what NOT to include)
     - No placeholders warning
   - Provide a clean template section for copy/paste
   - Include a filled-in example showing proper format with at least 3 checkbox items

2. **Verify all acceptance criteria are met**:
   - Single canonical template with required sections ✅
   - Example AC block with `- [ ]` checkboxes (at least 3 items) ✅
   - Explicit UI-verifiability instructions ✅
   - Explicit placeholder warnings ✅
   - Template placed where agents will see it (already in `docs/templates/ticket.template.md`, referenced in `docs/process/ready-to-start-checklist.md`) ✅

## File touchpoints

- `docs/templates/ticket.template.md` — Update with copy/paste template, example, and explicit instructions
