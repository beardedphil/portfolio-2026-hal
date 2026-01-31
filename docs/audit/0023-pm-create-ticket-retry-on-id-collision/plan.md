# Plan: 0023 - PM create_ticket retry on ID/filename collision

## Goal

Make concurrent ticket creation robust by detecting `id`/`filename` collisions and automatically retrying with the next ID until an insert succeeds.

## Analysis

### Current State

- create_ticket (hal-agents) computes the next ID by reading existing IDs and using `max + 1`. If two agents or two requests create tickets at the same time, both can choose the same next ID; one insert fails with a unique constraint violation.

### Approach

1. **Collision detection**: Treat Supabase insert errors as collision when Postgres code is `23505` (unique_violation) or message contains "duplicate key" / "unique constraint".
2. **Retry loop**: After fetching existing IDs once, compute a starting candidate ID (`startNum = max + 1`). For each attempt (1..MAX_CREATE_TICKET_RETRIES, cap 10):
   - Build candidate id = pad(startNum + attempt - 1), filename = `id-slug.md`.
   - Insert. On success, return success with id, filename, filePath; if attempt > 1, include `retried: true` and `attempts: N` for Diagnostics.
   - On insert error: if collision (unique violation), continue to next attempt; otherwise return failure immediately.
3. **Exhaustion**: After 10 attempts, return a clear error: "Could not reserve a ticket ID after N attempts (id/filename collision)."
4. **Diagnostics**: Success payload includes optional `retried` and `attempts`; server passes them into ticketCreationResult; App Diagnostics "Ticket creation" shows "Collision resolved after N attempt(s)" when present.

## Implementation Steps

1. In projectManager.ts: add `MAX_CREATE_TICKET_RETRIES`, `isUniqueViolation()` helper; refactor create_ticket execute to a retry loop with collision detection and bounded attempts.
2. In vite.config.ts: extend ticketCreationResult type and assignment to include retried/attempts from create_ticket output when present.
3. In App.tsx: extend TicketCreationResult type; in Diagnostics Ticket creation section, show retry line when retried/attempts present.
4. Create audit artifacts (plan, worklog, changed-files, decisions, verification, pm-review).
