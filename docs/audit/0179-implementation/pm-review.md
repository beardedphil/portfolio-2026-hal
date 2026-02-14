# PM Review for ticket 0179

## Summary

Updated `docs/templates/ticket.template.md` to provide a single canonical copy/paste ticket template that includes:
- Required sections in correct order (Goal, Human-verifiable deliverable, Acceptance criteria, Constraints, Non-goals)
- A filled-in example showing properly formatted `- [ ]` Acceptance criteria checkboxes (4 items)
- Explicit instructions to keep AC UI-verifiable (with examples of what NOT to include)
- Explicit warnings against placeholders (with examples)

## Acceptance criteria verification

- [x] **Single canonical copy/paste ticket template** with required sections: Goal, Human-verifiable deliverable, Acceptance criteria, Constraints, Non-goals
  - ✅ Template includes all 5 required sections in correct order
  - ✅ Template is in `docs/templates/ticket.template.md` (referenced in `docs/process/ready-to-start-checklist.md`)

- [x] **Example Acceptance criteria block** with `- [ ]` checkbox lines (at least 3 example items)
  - ✅ Example includes 4 Acceptance criteria items using `- [ ]` checkboxes
  - ✅ All items are UI-verifiable

- [x] **Explicit instructions** to keep AC UI-verifiable (no "run command", "check logs", "verify DB row")
  - ✅ "Critical requirements" section explicitly states: "Acceptance criteria MUST be UI-verifiable — a human can confirm by looking at the UI or running a manual test (no 'code compiles', 'tests pass', 'check logs', 'verify DB row')"

- [x] **Explicit warnings** against placeholders (e.g. `<...>`, "TBD", "(auto-assigned)") and requires removing them before moving ticket out of Unassigned
  - ✅ "Critical requirements" section explicitly states: "NO placeholders allowed — Remove all angle-bracket placeholders (`<...>`, `<AC 1>`, etc.) and text placeholders (`TBD`, `(auto-assigned)`, etc.) before moving ticket out of Unassigned"

- [x] **Template placed** where agents will actually see it (either in an existing ticket-writing / readiness doc, or referenced from those docs)
  - ✅ Template is in `docs/templates/ticket.template.md`
  - ✅ Referenced in `docs/process/ready-to-start-checklist.md` (line 95)
  - ✅ Used by PM agent when creating tickets (injected into context pack)

## Code locations

- `docs/templates/ticket.template.md:1-114` — Updated ticket template with copy/paste section, example, and explicit instructions

## State Management Changes

**State management changes made:** No

No state management changes were made in this ticket. This ticket only updates documentation (the ticket template file).

## Human-verifiable deliverable

A documented **"Ticket template (copy/paste)"** section exists in `docs/templates/ticket.template.md` that includes:
1. The required headings in the correct order (Goal, Human-verifiable deliverable, Acceptance criteria, Constraints, Non-goals)
2. A filled-in example showing properly formatted `- [ ]` Acceptance criteria checkboxes (4 items, all UI-verifiable)

The template is placed where agents will see it (`docs/templates/ticket.template.md`, referenced in `docs/process/ready-to-start-checklist.md`).
