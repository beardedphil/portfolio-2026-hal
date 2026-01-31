# PM Handoff Notes (Process + Gotchas)

This file is for future PM agents working in this repo.

## Role boundaries

- PM agent work: write tickets, run `npm run sync-tickets` after editing `docs/tickets/`, review artifacts, and update `.cursor/rules/`.
- Implementation agents: implement code, create audit artifacts, and handle feature branches + merges.

## Common gotchas we hit

- **HAL “connect folder” expectations**:
  - HAL reads `.env` from a selected folder and sends Supabase creds to the embedded kanban via `postMessage`.
  - If you see columns but no tickets, check Supabase schema requirements (e.g. `kanban_columns` may be required by the kanban app).
- **Supabase schema drift**: `tickets` may exist while `kanban_columns` is missing. The kanban app may disconnect/clear tickets if schema is incomplete.
- **Superrepo vs project repos**:
  - HAL is a superrepo; kanban logic lives in the kanban submodule.
  - Bugs in kanban behavior generally belong in the kanban repo, not HAL.

## Cross-repo work

- Tickets may be *discovered* in HAL but *implemented* in kanban. Make sure the ticket location and the implementation/audit location are intentionally chosen and documented.

