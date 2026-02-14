# PM Handoff Notes (Process + Gotchas)

This file is for future PM agents working in this repo.

## Role boundaries

- PM agent work: create tickets in Supabase (via app); run `npm run sync-tickets` to propagate DB → `docs/tickets/`; review artifacts; update `.cursor/rules/`. Do not create or edit ticket files directly in the repo—tickets are created only in Supabase and the change propagates down.
- Implementation agents: implement code, create audit artifacts, and handle feature branches. QA merges to main; implementation agents do not merge.
- QA: code review + automated verification only (no manual UI testing). When satisfied, merge to `main` and move ticket to **Human in the Loop**.
- Human in the Loop: user tests merged work at http://localhost:5173. The dev server serves `main` only — `npm run dev` enforces this.

## Kanban workflow columns

- Unassigned → To-do → Doing → QA → Human in the Loop → Done
- Will Not Implement: for tickets that will not be implemented.

## Peer Review / Definition of Ready Check (0180)

Before a ticket can be moved from **Unassigned** to **To Do**, it must pass a **Peer Review / DoR (Definition of Ready) check**. This lightweight validation ensures tickets are properly formatted and meet minimum requirements:

- **Required sections present:**
  - `## Goal (one sentence)`
  - `## Human-verifiable deliverable (UI-only)`
  - `## Acceptance criteria (UI-only)`

- **Acceptance criteria format:** Must use checkbox format (`- [ ]`) not plain bullets (`-`)

- **No unresolved placeholders:** No `<...>`, `TODO`, `FIXME`, `XXX`, or bracket placeholders

- **Sections have content:** Required sections must not be empty

**How to use:**
1. Open any ticket in **Unassigned** or **To Do** column
2. Click **"Run Peer Review / DoR Check"** button in the ticket detail view
3. Review the PASS/FAIL result and specific issues (if any)
4. Fix issues before attempting to move ticket to To Do
5. The **"Prepare top ticket"** button will automatically check peer review and prevent moving to To Do if the check fails

**When peer review FAILs:**
- Ticket cannot be moved to To Do via PM automation
- "Prepare top ticket" button will show an error and prevent the action
- Issues are listed with clickable links to help fix them

**When peer review PASSes:**
- Ticket is eligible to be moved to To Do
- PM automation can proceed normally

## Common gotchas we hit

- **HAL “connect folder” expectations**:
  - HAL reads `.env` from a selected folder and sends Supabase creds to the embedded kanban via `postMessage`.
  - If you see columns but no tickets, check Supabase schema requirements (e.g. `kanban_columns` may be required by the kanban app).
- **Supabase schema drift**: `tickets` may exist while `kanban_columns` is missing. The kanban app may disconnect/clear tickets if schema is incomplete.
- **Superrepo vs project repos**:
  - HAL is a monorepo; kanban lives under `projects/kanban` (vendored, not a submodule).
  - Bugs in kanban behavior generally belong in the kanban repo, not HAL.
- **Single source for agents**: `projects/hal-agents` is a **normal directory** in HAL (not a submodule). Edit agents code only here so there is one place to change. See [single-source-agents.md](single-source-agents.md).

## Cross-repo work

- Tickets may be *discovered* in HAL but *implemented* in kanban. Make sure the ticket location and the implementation/audit location are intentionally chosen and documented.

