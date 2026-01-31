# QA Report: 0023 - PM create_ticket retry on ID/filename collision

## 1. Ticket & deliverable

- **Goal:** Make concurrent ticket creation robust by detecting id/filename collisions and automatically retrying with the next ID until an insert succeeds.
- **Deliverable:** create_ticket detects unique constraint failures (Postgres 23505 or duplicate/unique message), retries with the next ID up to 10 times, and returns success with the final id/filename/filePath. When a retry occurred, Diagnostics shows retried/attempts and the final chosen ID. No secrets in Diagnostics.
- **Acceptance criteria:** With project connected (Supabase), trigger ticket creation in a way that can cause concurrency; both requests complete without fatal error; two tickets appear in Kanban Unassigned with distinct IDs; Diagnostics for the retried request indicates retry (and final ID); ticket Markdown files exist under docs/tickets/NNNN-*.md after sync.

## 2. Audit artifacts

All required artifacts are present in `docs/audit/0023-pm-create-ticket-retry-on-id-collision/`:

- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md`
- `pm-review.md`

## 3. Code review — PASS

Implementation matches the ticket and plan.

| Requirement | Implementation |
|-------------|----------------|
| Collision at creation time (inside create_ticket) | projectManager.ts: create_ticket execute contains the retry loop; no change in sync-tickets. |
| Collision detection (23505 / duplicate key / unique constraint) | projectManager.ts: `isUniqueViolation(err)` checks `code === '23505'` and message contains "duplicate key" or "unique constraint" (lines 299–304). |
| Retry loop: fetch IDs once, then linear sequence | projectManager.ts: single fetch of existing IDs, `startNum = max(numericIds) + 1`; loop `attempt = 1..MAX_CREATE_TICKET_RETRIES`, candidate id = pad(startNum + attempt - 1) (lines 416–419, 421–424). |
| Cap 10 retries; clear error on exhaustion | projectManager.ts: `MAX_CREATE_TICKET_RETRIES = 10`; on exhaustion returns "Could not reserve a ticket ID after N attempts (id/filename collision). Last: …" (lines 287, 504–508). |
| Success payload includes retried/attempts when attempt > 1 | projectManager.ts: on insert success, `...(attempt > 1 && { retried: true, attempts: attempt })` (lines 491–493). |
| Diagnostics: retried/attempts and final ID | vite.config.ts: ticketCreationResult type and assignment include retried/attempts from create_ticket output (lines 43–51, 287–299). App.tsx: TicketCreationResult has retried/attempts; Diagnostics "Ticket creation" shows "Retry: Collision resolved after N attempt(s)" when set (lines 26–27, 998–999). |
| No secrets in Diagnostics | Only id, filePath, retried, attempts, sync status are shown; no API keys or body content. |

Constraints satisfied: verification is UI-only (no external tools); fix is minimal (retry loop only); no secret leak in Diagnostics.

## 4. UI verification — Manual

Verification requires a connected project (Supabase) and is UI-only (no terminal/devtools/console). Manual steps from `verification.md`:

1. **Concurrent-style check:** With project connected, trigger ticket creation in a way that can cause concurrency (e.g. send "create ticket for X" then immediately "create ticket for Y" before the first completes, or use two tabs if available).
2. **Both complete:** Confirm both requests complete without a fatal error (no unhandled crash or 500 due to collision).
3. **Two tickets, distinct IDs:** Confirm two tickets appear in Kanban Unassigned, each with a distinct ID (e.g. 0030 and 0031).
4. **Diagnostics:** Open Diagnostics. For the request that hit a collision and retried: in Tool Calls, create_ticket output should show `retried: true` and `attempts: N` (N > 1) and the final `id`; in Ticket creation, "Retry: Collision resolved after N attempt(s)" and the final Ticket ID.
5. **Files after sync:** After the normal sync path runs (or manual sync), confirm both ticket Markdown files exist under `docs/tickets/NNNN-*.md`.

If true concurrency is hard to trigger: at least verify (1) single create_ticket works and returns id/filename/filePath; (2) Diagnostics shows Ticket creation with ID and file path; (3) code path for retry (isUniqueViolation + loop) is present as above.

## 5. Verdict

- **Implementation:** Complete and matches the ticket, plan, and constraints.
- **Merge:** OK to merge after **manual UI verification** above is run (connect project, trigger two quick create-ticket flows or single create + Diagnostics check, confirm distinct tickets and retry message when collision occurs).
