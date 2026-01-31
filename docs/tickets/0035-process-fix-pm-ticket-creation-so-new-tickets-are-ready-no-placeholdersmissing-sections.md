# Title
Process: Fix PM ticket creation so new tickets are “Ready” (no placeholders/missing sections)

## Owner
PM / Agent Platform

## Type
Bug

## Priority
P0

## Linkage
Relates to: 0034

## Goal (one sentence)
Ensure tickets created by the PM agent are generated in a “ready to start” state (no template placeholders, and all required sections populated).

## Human-verifiable deliverable (UI-only)
A human can ask the PM agent in chat to “create a ticket for a feature (e.g. "create a ticket for X")” and then view the newly created ticket in the embedded kanban UI and confirm the ticket includes a concrete Goal, Deliverable, Acceptance Criteria checkboxes, Constraints, and Non-goals, with no angle-bracket placeholders anywhere in the ticket body.

## Acceptance criteria (UI-only)
- [ ] Creating a ticket via the PM agent results in a ticket whose body contains **no** unresolved template placeholders (e.g. task-id, short-title, AC 1, or similar angle-bracket tokens).
- [ ] The created ticket includes non-empty sections for: Goal (one sentence), Human-verifiable deliverable (UI-only), Acceptance criteria (UI-only) with at least one checkbox, Constraints (with at least one concrete bullet), and Non-goals (with at least one concrete bullet).
- [ ] The PM “Unassigned check” no longer flags newly created PM tickets as “not ready” due to missing sections or placeholders.
- [ ] If the PM agent cannot generate a ready ticket (e.g., insufficient user detail), it asks **one** clarifying question *before* creating the ticket rather than creating a placeholder-filled ticket.

## Constraints
- Must follow `docs/templates/ticket.template.md` exactly (no missing required sections).
- Must respect the “one question when input needed” rule (`.cursor/rules/conversation-protocol.mdc`).
- Verification must be UI-only (no requiring terminal or devtools).

## Non-goals
- Retroactively fixing or rewriting all existing not-ready tickets (those can be handled in separate tickets if desired).
- Redesigning the embedded kanban UI beyond what’s needed to verify ticket readiness.

## Implementation notes
- Investigate where the PM agent’s ticket markdown is being generated and why placeholders are not being filled (prompt/template mismatch, truncation, or tool-call body not using the template).
- Add a guardrail step that validates the body against the Ready-to-start checklist before calling `create_ticket`.
- If validation fails, generate a single clarifying question to the user instead of creating the ticket.

## History
- PM cleanup for DoR (0036).

## Audit artifacts
- Add in-app diagnostics that can display the last “ticket generation validation result” for the PM agent (pass/fail + missing sections + any placeholder matches), so a non-technical verifier can confirm the fix without console logs.