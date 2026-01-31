# Verification (UI-only): 0023 - PM create_ticket retry on ID/filename collision

## Prerequisites

- Project folder connected (Supabase enabled).
- HAL app and Kanban app running (e.g. npm run dev from repo root).
- hal-agents built.

## Steps

1. **Concurrent-style check**: With a project connected, trigger ticket creation in a way that can cause concurrency (e.g. two quick "create ticket" requests—send one, then immediately send another before the first completes, or use two tabs/clients if available).
2. Confirm **both requests complete without a fatal error** (no unhandled crash or generic 500 due to collision).
3. Confirm **two tickets appear in Kanban Unassigned**, each with a **distinct ID** (e.g. 0030 and 0031).
4. Open **Diagnostics**. For the request(s) that hit a collision and retried:
   - In **Tool Calls**, the create_ticket output for the retried request should show `retried: true` and `attempts: N` (N > 1), and the final `id` (e.g. 0031).
   - In **Ticket creation**, when retried, the section should show "Retry: Collision resolved after N attempt(s)" and the final Ticket ID.
5. After the normal sync path runs (or manual sync), confirm the **resulting ticket Markdown files exist** under `docs/tickets/NNNN-*.md` for both tickets.

## Pass criteria

- Two quick create-ticket flows complete without fatal error.
- Two tickets in Kanban Unassigned with distinct IDs.
- Diagnostics indicates when a retry occurred (retried/attempts and final ID).
- Ticket files exist under docs/tickets/ after sync.

## Note

Verification requires no external tools (no terminal/devtools/console). If true concurrent requests are hard to trigger, at least verify: (1) single create_ticket still works and returns id/filename/filePath; (2) Diagnostics shows Ticket creation with ID and file path; (3) code path for retry (isUniqueViolation + loop) is present and unit-testable in future if desired.
