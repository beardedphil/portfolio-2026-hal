# Changed files: 0023 - PM create_ticket retry on ID/filename collision

## New

- `docs/audit/0023-pm-create-ticket-retry-on-id-collision/plan.md`
- `docs/audit/0023-pm-create-ticket-retry-on-id-collision/worklog.md`
- `docs/audit/0023-pm-create-ticket-retry-on-id-collision/changed-files.md`
- `docs/audit/0023-pm-create-ticket-retry-on-id-collision/decisions.md`
- `docs/audit/0023-pm-create-ticket-retry-on-id-collision/verification.md`
- `docs/audit/0023-pm-create-ticket-retry-on-id-collision/pm-review.md`

## Modified

- `projects/hal-agents/src/agents/projectManager.ts` — Retry-on-collision in create_ticket: isUniqueViolation(), MAX_CREATE_TICKET_RETRIES, loop with candidate id per attempt; success payload includes retried/attempts when attempt > 1.
- `vite.config.ts` — ticketCreationResult type and assignment extended with retried/attempts from create_ticket output.
- `src/App.tsx` — TicketCreationResult type extended with retried/attempts; Diagnostics Ticket creation shows retry line when present.
