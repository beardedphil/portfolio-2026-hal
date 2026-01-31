# PM review: 0023 - PM create_ticket retry on ID/filename collision

## Deliverable

create_ticket detects id/filename uniqueness failures (Postgres 23505 or duplicate/unique message), retries with the next ID up to 10 times, and returns success with the final id/filename/filePath. When a retry occurred, Diagnostics shows retried/attempts and the final chosen ID. No secrets in Diagnostics.

## Acceptance criteria

- [ ] With a project connected (Supabase enabled), trigger ticket creation in a way that can cause concurrency (e.g. two quick "create ticket" requests).
- [ ] Both requests complete without a fatal error.
- [ ] Two tickets appear in Kanban Unassigned, each with a distinct ID.
- [ ] Diagnostics for the "retried" request indicates a retry occurred (bounded info), including the final chosen ID.
- [ ] The resulting ticket Markdown files exist under `docs/tickets/NNNN-*.md` after the normal sync path runs.

## Constraints

- Verification must require no external tools (no terminal/devtools/console).
- Fix is minimal; no redesign of ID assignment.
- Do not leak secrets in Diagnostics.

## Non-goals

- Introducing a database sequence/RPC for ticket IDs (could be a later enhancement).
- Handling deletion/tombstone reconciliation (separate ticket).
