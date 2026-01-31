# Changed files: 0034 - Meta: Investigate why PM agent-created tickets are not "ready"

## New

- `docs/audit/0034-meta-investigate-why-pm-agent-created-tickets-are-not-ready-placeholdersmissing-sections/plan.md`
- `docs/audit/0034-meta-investigate-why-pm-agent-created-tickets-are-not-ready-placeholdersmissing-sections/worklog.md`
- `docs/audit/0034-meta-investigate-why-pm-agent-created-tickets-are-not-ready-placeholdersmissing-sections/changed-files.md`
- `docs/audit/0034-meta-investigate-why-pm-agent-created-tickets-are-not-ready-placeholdersmissing-sections/decisions.md`
- `docs/audit/0034-meta-investigate-why-pm-agent-created-tickets-are-not-ready-placeholdersmissing-sections/verification.md`
- `docs/audit/0034-meta-investigate-why-pm-agent-created-tickets-are-not-ready-placeholdersmissing-sections/pm-review.md`

## Modified

- `projects/hal-agents/src/agents/projectManager.ts` — buildContextPack: add Ticket template section (read docs/templates/ticket.template.md, inject with instruction). create_ticket: stronger description and body_md parameter; success output includes ready + missingItems (evaluateTicketReady after insert); fallback reply appends not-ready diagnostic when missingItems present.
