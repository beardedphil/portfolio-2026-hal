# Worklog: 0023 - PM create_ticket retry on ID/filename collision

## Summary

- **projectManager.ts**: Added `MAX_CREATE_TICKET_RETRIES` (10) and `isUniqueViolation(err)` (checks `code === '23505'` or message contains "duplicate key" / "unique constraint"). create_ticket execute now: fetches existing IDs once, computes `startNum`; loops up to 10 attempts with candidate id = pad(startNum + attempt - 1); on insert success returns { success, id, filename, filePath, retried?, attempts? }; on unique violation continues; on other error or exhaustion returns failure with clear message.
- **vite.config.ts**: ticketCreationResult type and assignment extended with optional `retried` and `attempts` from create_ticket output when present.
- **App.tsx**: TicketCreationResult type extended with `retried?` and `attempts?`; Diagnostics "Ticket creation" section shows "Retry: Collision resolved after N attempt(s)" when retried/attempts are set.
- **Audit**: Created docs/audit/0023-pm-create-ticket-retry-on-id-collision/ (plan, worklog, changed-files, decisions, verification, pm-review).

## Decisions

- Handle collisions at creation time inside create_ticket (not in sync-tickets), to avoid renumbering existing rows and surprising changes.
- Do not re-fetch existing IDs on each retry; advance candidate id linearly (startNum + attempt - 1) to avoid races.
- Cap at 10 retries; clear error message on exhaustion. No secrets in Diagnostics (retried/attempts and final id only).
