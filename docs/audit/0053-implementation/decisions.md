# Decisions: 0053 - Implementation Agent automatically moves ticket from To Do to Doing

## Move only from To Do

- **Decision**: Only move the ticket if it's currently in `col-todo` (To Do). If it's already in `col-doing` or later columns, skip the move.
- **Rationale**: Prevents backwards moves (e.g., moving from QA back to Doing) and respects the ticket's current state.

## Error handling: fail fast

- **Decision**: If the move to Doing fails (DB fetch error, update error), emit a `failed` stage immediately and end the request. Do not proceed with launching the cloud agent.
- **Rationale**: The ticket move is a prerequisite for starting work. If it fails, the user should know immediately and the ticket should remain in To Do.

## Frontmatter sync

- **Decision**: Update the ticket's `body_md` frontmatter when moving to Doing, same pattern as moving to QA (lines 602-623 in vite.config.ts).
- **Rationale**: Keeps DB and docs in sync. The frontmatter is the source of truth for docs/tickets/*.md after sync-tickets runs.

## Non-blocking sync-tickets

- **Decision**: Run `sync-tickets.js` after the move, but don't wait for it or fail if it errors. The DB update is the source of truth.
- **Rationale**: Sync is a convenience to propagate changes to docs. The Kanban board reads from Supabase, so the move is visible immediately even if sync fails.

## Error message clarity

- **Decision**: Error messages explicitly state "The ticket remains in To Do" so the user knows the ticket's state.
- **Rationale**: Clear feedback about what happened and what the current state is.
