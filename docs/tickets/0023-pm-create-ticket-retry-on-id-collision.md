# Ticket

- **ID**: `0023`
- **Title**: PM `create_ticket`: retry on ID/filename collision (increment until available)
- **Owner**: Implementation agent
- **Type**: Bug
- **Priority**: P1

## Linkage (for tracking)

- **Fixes**: `0011`
- **Category**: `State`

## Ready for verification (implementation agent fills when work is pushed)

- **Branch**: `ticket/0023-pm-create-ticket-retry-on-id-collision` — QA (or the user) checks out this branch to verify, then merges to `main`.

## Goal (one sentence)

Make concurrent ticket creation robust by detecting `id`/`filename` collisions and automatically retrying with the next ID until an insert succeeds.

## Background / problem

The current `create_ticket` tool computes the “next ID” by reading existing IDs and using `max + 1`. If two agents (or two requests) create tickets at the same time, both can choose the same next ID, and one insert will fail due to a uniqueness collision.

This is rare but will happen with concurrent agents. We want it to self-heal automatically rather than requiring manual intervention.

## Human-verifiable deliverable (UI-only)

A human can trigger ticket creation twice in rapid succession (or with two agents) and see both tickets created successfully in Kanban **Unassigned**, with distinct IDs, without manual retries.

## Acceptance criteria (UI-only)

- [ ] With a project connected (Supabase enabled), trigger ticket creation in a way that can cause concurrency (e.g. two quick “create ticket” requests).
- [ ] Both requests complete without a fatal error.
- [ ] Two tickets appear in Kanban **Unassigned**, each with a distinct ID.
- [ ] Diagnostics for the “retried” request indicates a retry occurred (bounded info is fine), including the final chosen ID.
- [ ] The resulting ticket Markdown files exist under `docs/tickets/NNNN-*.md` after the normal sync path runs.

## Constraints

- Verification must require **no external tools** (no terminal/devtools/console).
- Keep the fix minimal; this is not a redesign of ID assignment.
- Do not leak secrets in Diagnostics.

## Non-goals

- Introducing a database sequence/RPC for ticket IDs (could be a later enhancement).
- Handling deletion/tombstone reconciliation (tracked separately).

## Implementation notes (optional)

- Prefer handling collisions at creation time (inside the `create_ticket` tool), not later during `sync-tickets`.
  - Reason: renumbering during sync would require updating existing DB rows and any references, and risks surprising changes.
- Suggested algorithm:
  1. Compute a starting candidate (current logic is fine).
  2. Attempt insert.
  3. If insert fails with a unique/duplicate error for `tickets.id` (or `tickets.filename`), increment ID and retry.
  4. Cap retries (e.g. 10) and fail with a clear error if exhausted.
- Consider also handling the case where the title/slug yields the same filename (e.g. identical titles) by appending `-2`, `-3`, etc., but only if filename uniqueness is enforced in DB.

## Audit artifacts required (implementation agent)

Create `docs/audit/0023-pm-create-ticket-retry-on-id-collision/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)
- `pm-review.md`

