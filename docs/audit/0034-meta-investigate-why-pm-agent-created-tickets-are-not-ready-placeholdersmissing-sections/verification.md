# Verification (UI-only): 0034 - Meta: Investigate why PM agent-created tickets are not "ready"

## Prerequisites

- Project folder connected (Supabase enabled).
- HAL app and Kanban app running (e.g. npm run dev from repo root).
- hal-agents built.

## Steps

1. **Create a ticket via chat**: In HAL, with the project connected, ask the PM agent to create a ticket (e.g. "Create a ticket: Add a footer to the Kanban board with the repo name").
2. **Confirm ticket appears**: The new ticket appears in the Kanban board under Unassigned (sync may run automatically or after refresh).
3. **Confirm ticket body is ready**: Open the ticket (click card or view details). Verify:
   - **Goal (one sentence)** has a real sentence, not `<what we want to achieve>`.
   - **Human-verifiable deliverable (UI-only)** has concrete description, not a placeholder.
   - **Acceptance criteria (UI-only)** has at least one checkbox line (`- [ ] ...`).
   - **Constraints** and **Non-goals** have at least one bullet each.
   - No unresolved angle-bracket placeholders (e.g. no `<AC 1>`, `<task-id>`, `<short title>`).
4. **Confirm Unassigned check passes**: After sync, the PM Unassigned check message should **not** list the newly created ticket as "Not ready". It should either move it to To Do (if auto-move is in effect) or report "No tickets in Unassigned, or all were already ready" / "Moved to To Do: NNNN."
5. **Diagnostics**: In Diagnostics, for the create_ticket tool call, the output should include `ready: true` (and no `missingItems`). If for any reason the model left placeholders, the output would show `ready: false` and `missingItems: [...]`, and the chat reply should mention what is missing (in-app diagnostic).

## Screenshots (filenames for audit)

- `verification-created-ticket-details.png` — Created ticket details UI (or raw ticket view) showing Goal, Deliverable, Acceptance criteria, Constraints, Non-goals filled with concrete content.
- `verification-readiness-check-passing.png` — Unassigned check message or ticket in To Do / readiness indicator passing.

## Pass criteria

- Creating a new ticket via chat results in a ticket with non-placeholder Goal, Deliverable, Acceptance criteria, Constraints, and Non-goals.
- The created ticket contains Acceptance criteria checkboxes (`- [ ] ...`).
- The created ticket contains no unresolved template placeholders (no angle-bracket tokens).
- The PM Unassigned check does not report the newly created ticket as "Not ready" for missing sections/placeholders.
- When a created ticket is not ready, the UI shows an in-app diagnostic (tool output + reply) explaining what was missing; no console required.

## Note

Verification requires no external tools (no terminal/devtools/console). If the model occasionally still leaves a placeholder, the create_ticket output will show `ready: false` and `missingItems`, and the fallback reply will tell the user what to fix.
