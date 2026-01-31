# Worklog: 0034 - Meta: Investigate why PM agent-created tickets are not "ready"

## Summary

- **projectManager.ts buildContextPack**: Added "Ticket template (required structure for create_ticket)" section before "Ready-to-start checklist". Reads `docs/templates/ticket.template.md` from config.repoRoot and injects full template content plus instruction: "When creating a ticket, use this exact section structure. Replace every placeholder in angle brackets with concrete content—the resulting ticket must pass the Ready-to-start checklist (no unresolved placeholders, all required sections filled)."
- **projectManager.ts create_ticket tool**: (1) Description updated to require "exact structure from the Ticket template section", "Replace every angle-bracket placeholder with concrete content", "no <placeholders> left". (2) body_md parameter description updated to require "all required sections filled with concrete content", "No angle-bracket placeholders", "Must pass Ready-to-start checklist". (3) Success result type extended with `ready: boolean` and optional `missingItems?: string[]`. (4) After successful insert, call `evaluateTicketReady(input.body_md.trim())` and add `ready` and `missingItems` (when non-empty) to output. (5) Fallback reply when model returns no text after create_ticket: if `out.ready === false` and `out.missingItems?.length`, append " The ticket is not yet ready for To Do: …" so user sees in-app diagnostic.
- **Audit**: Created docs/audit/0034-meta-investigate-why-pm-agent-created-tickets-are-not-ready-placeholdersmissing-sections/ (plan, worklog, changed-files, decisions, verification, pm-review).

## Decisions

- Single source of truth for required sections remains docs/templates/ticket.template.md; context pack now includes it so the model sees exact structure.
- Readiness is evaluated at creation time and returned in tool output so Diagnostics and the model can report missing items without waiting for Unassigned check.
- No change to evaluate_ticket_ready logic or ready-to-start-checklist.md; creation flow is fixed so output matches the existing checklist.
