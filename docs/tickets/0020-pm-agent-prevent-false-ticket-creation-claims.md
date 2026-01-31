# Ticket

- **ID**: `0020`
- **Title**: PM agent: prevent false “ticket created” claims (verify file + sync)
- **Owner**: Implementation agent
- **Type**: Bug
- **Priority**: P0

## Linkage (for tracking)

- **Fixes**: `0011`
- **Category**: `Process`

## Goal (one sentence)

Prevent the PM agent from claiming it created a ticket unless the ticket file was actually written and `sync-tickets` succeeded, and surface a clear in-app error when ticket creation is not implemented or fails.

## Background / problem

We observed the PM chat respond with a message like “Created ticket 0018…” even though no ticket file existed in `portfolio-2026-hal/docs/tickets/`.

Root issue: the PM chat can currently output “side-effect” claims as plain text without being coupled to any verified write path.

## Human-verifiable deliverable (UI-only)

A human can ask the PM to “create a ticket” and the UI will either:
- show a real, verifiable ticket creation (file path + ticket ID + appears in Unassigned), **or**
- show an explicit “ticket creation not available / failed” message, **without** inventing a ticket ID or file path.

## Acceptance criteria (UI-only)

- [ ] Trigger ticket creation via the intended mechanism from `0011` (button or clear chat command).
- [ ] If ticket creation is not implemented or write tools are unavailable:
  - [ ] The PM responds with a clear failure message (no “Created ticket …” language).
  - [ ] Diagnostics shows `ticketCreationStatus: not-implemented` (or equivalent) and no ticket ID/path.
- [ ] If ticket writing fails (filesystem or permissions):
  - [ ] The PM response indicates failure (no success claim).
  - [ ] Diagnostics shows the failure phase and a human-readable error string.
- [ ] If `sync-tickets` fails:
  - [ ] The PM response indicates failure (no success claim).
  - [ ] Diagnostics shows the sync failure and the ticket is **not** claimed as present in Unassigned.
- [ ] Only when all steps succeed (write + sync):
  - [ ] The PM response includes the exact created ticket ID and file path.
  - [ ] The ticket appears in Kanban **Unassigned** without manual refresh (within normal poll interval).

## Constraints

- Verification must require **no external tools** (no terminal, no devtools, no console).
- Keep this minimal: add only the guardrails/verification gates needed to stop false claims.
- Do not leak secrets in Diagnostics (redact URLs/keys/tokens as needed).

## Non-goals

- Designing the full ticket creation UX (handled by `0011`).
- Adding new ticket fields or changing the global ticket template.

## Implementation notes (optional)

- Couple the “success” UI message to a verified result object produced by the ticket creation pipeline (file create + sync result).
- Avoid reserving/announcing a ticket ID until the ticket file is actually created.
- If using LLM output to draft the ticket, treat it as **draft content** only; the app must be the source of truth for “created” vs “failed.”

## Audit artifacts required (implementation agent)

Create `docs/audit/0020-pm-agent-prevent-false-ticket-creation-claims/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)
- `pm-review.md`

