---
kanbanColumnId: col-done
kanbanPosition: 0
kanbanMovedAt: 2026-02-01T17:12:29.166+00:00
---
# Title
Meta: Investigate why PM agent-created tickets are not “ready” (placeholders/missing sections)

# Owner
Unassigned

# Type
Bug

# Priority
P0

# Linkage
Related: 0025, 0027, 0029, 0030, 0031, 0033

## Goal (one sentence)
Identify and fix the root cause that leads to newly created tickets containing unresolved placeholders and/or missing required sections, so new tickets are immediately “Ready-to-start” per the Definition of Ready.

## Human-verifiable deliverable (UI-only)
In HAL, a PM can ask the agent to “create a ticket …”, and the resulting ticket:
- appears in the embedded Kanban UI, and
- passes the in-app “Unassigned check / ready-to-start” validation with no placeholder warnings.

## Acceptance criteria (UI-only)
- [ ] Creating a new ticket via chat results in a ticket that contains a non-placeholder Goal, Deliverable, Constraints, and Non-goals sections.
- [ ] The created ticket contains Acceptance Criteria checkboxes (`- [ ] ...`).
- [ ] The created ticket contains **no** unresolved template placeholders (e.g. task-id, short-title, or other angle-bracket tokens).
- [ ] The PM “Unassigned check” (or equivalent in-app readiness validation) does **not** report the newly created ticket as “Not ready” for missing sections/placeholders.
- [ ] If ticket creation fails to populate required fields, the UI shows an in-app diagnostic explaining what was missing and why (no console required).

## Constraints
- Must follow `docs/templates/ticket.template.md` as the single source of truth for required ticket sections.
- Must align with `docs/process/ready-to-start-checklist.md` and the `evaluate_ticket_ready` behavior.
- Do not require devtools/console to verify; use in-app diagnostics.
- Do not introduce unrelated ticket template changes unless required; if template changes are required, document rationale.

## Non-goals
- Fixing the content/scope of existing not-ready tickets individually (except as test fixtures).
- Redesigning the entire Kanban UI.

# Implementation notes
- Reproduce by creating a ticket through the agent flow and comparing the resulting `docs/tickets/*.md` body to `docs/templates/ticket.template.md`.
- Investigate whether the ticket-creation tool/path is using an outdated template, truncating sections, or post-processing content incorrectly.
- Check for any intermediate “draft” formatting step that might insert placeholders (e.g. task-id, short-title) or drop sections.
- Ensure the readiness validator matches the actual template and that the creation flow fills required fields.

# History
- PM cleanup for DoR (0036).

# Audit artifacts
- Create standard audit folder: `docs/audit/0034-meta-investigate-why-pm-agent-created-tickets-are-not-ready-placeholdersmissing-sections/` with plan/worklog/changed-files/decisions/verification/pm-review.
- Include screenshots (filenames) in `verification.md` showing:
  - the created ticket details UI (or raw ticket view) and
  - the readiness check passing.