# Ticket Verification Rules

This document defines how we decide a ticket is **properly completed**.

## QA and Human in the Loop

- **QA** (formerly "Ready for verification"): Code review + automated verification only. No manual UI testing. When QA is satisfied, QA merges to `main` and moves the ticket to **Human in the Loop**.
- **Human in the Loop**: The user tests merged work at http://localhost:5173. The dev server always serves `main` — `npm run dev` enforces this (`scripts/check-main-branch.js`).
- Kanban columns: Unassigned → To-do → Doing → **QA** → **Human in the Loop** → Done (and Will Not Implement).
- **Supabase-backed Kanban (all agents):** Always update tickets in the DB first (create, update body, move column), then run the sync script so changes propagate to `docs/tickets/*.md` and the UI. Do not edit ticket files locally for content or column — use `node scripts/move-ticket-column.js <ticketId> <columnId>` for column moves, then sync.

## Definition of Done (DoD) — for every ticket

- **Ticket exists**: `docs/tickets/<id>-<short-title>.md`
- **Ticket is committed**: the ticket file exists in git history on the branch being verified (not only on someone’s disk).
- **Required audit artifacts exist** (in Supabase `agent_artifacts`, not in repo):
  - plan, worklog, changed-files, decisions, verification, pm-review
  - **Artifact templates**: Implementation agents must follow templates in `docs/templates/`:
    - **Decisions artifact**: Must follow `docs/templates/decision-log.template.md` (includes Context, Decision, Alternatives Considered, Trade-offs, Consequences/Follow-ups, Links)
    - Other templates: See `docs/templates/` for PM Review and other artifact templates
- **Work is committed + pushed**:
  - the implementation agent has committed all changes and pushed them to the remote before declaring “ready for QA”
  - all commits for the ticket include the ticket ID in the commit subject (e.g. `feat(0010): ...`)
  - the agent’s completion message includes `git status -sb` output showing the branch is not ahead/behind and the working tree is clean
- **Repo cleanliness**:
  - no untracked files may remain from the task (unless explicitly ignored and documented as a generated artifact)
- **Verification steps**:
  - verification artifact (in Supabase) defines QA steps (code review + automated: build, lint) and, when relevant, Human-in-the-Loop steps (manual UI verification after merge)
  - no devtools / console / logs required for human verification
- **No “handoff chores”**:
  - a ticket cannot be considered “ready for QA” if the agent tells the user/PM to perform git steps (commit/push) or to update audit artifacts
  - the only allowed prerequisites are “open the app” (and, if unavoidable, starting the dev server)
- **Acceptance criteria satisfied**:
  - each checkbox in the ticket maps to one or more explicit steps in the verification artifact
  - verification includes clear **pass/fail observations**
- **In-app diagnostics updated as needed**:
  - if something can fail, the app should provide enough in-app visibility to understand “what happened” without the console

## PM review checklist (quick)

- **Scope discipline**: change matches ticket; no extra features slipped in
- **No unrequested UI changes**: styling/behavior outside the ticket did not change unless explicitly documented in decisions artifact
- **Traceability**: changed-files artifact matches what actually changed
- **Risk notes**: decisions artifact lists meaningful assumptions/trade-offs

## Where to put new verification rules

Add new rules here as additional sections. If a rule needs enforcing at agent-time, we can later mirror it into `.cursor/rules/`.
