---
kanbanColumnId: col-done
kanbanPosition: 0
kanbanMovedAt: 2026-02-01T02:00:01.637+00:00
---
## Ticket

- **Title**: Enforce no local changes on `main` until QA approves and merges feature branch
- **Owner**: Implementation agent
- **Type**: Process
- **Priority**: P1
- **Linkage**: Related to workspace rules in `.cursor/rules/` (branching + done-means-pushed). Related to any existing enforcement in `projects/hal-agents` and HAL diagnostics UI.

## Goal (one sentence)

Prevent agents from making any local code changes on `main` for ticketed work; all ticket work must occur on a `ticket/<id>-<slug>` feature branch, and only QA merges to `main`.

## Human-verifiable deliverable (UI-only)

When the current git branch is `main` and an agent is asked to implement a ticket, the app/agent workflow visibly blocks or redirects until a feature branch is created/checked out; diagnostics clearly show what branch is active and why work was blocked.

## Acceptance criteria (UI-only)

- [ ] In HAL, an in-app diagnostics/debug view shows the **current git branch name**.
- [ ] If the current branch is `main` and the user requests ticket implementation, the agent **refuses to proceed** and instead creates/checks out a `ticket/<id>-<slug>` branch first (this decision is visible in diagnostics).
- [ ] The agent does not perform file-modifying actions for ticket work on `main` (no “I made changes” while branch shows `main`).
- [ ] QA process is explicit: QA can verify the feature branch, then merge to `main` and delete the feature branch afterward (per `.cursor/rules/delete-branch-after-merge.mdc`).

## Constraints

- Enforcement must happen **before any file edits** for ticket work.
- Verification must be **UI-only** (no terminal/devtools).
- Prefer minimal changes: rules + a small “preflight guard” rather than building a full PR UI.

## Non-goals

- Retroactively rewriting history or cleaning up past mistakes.
- Implementing a full git UI inside HAL beyond what’s needed for branch gating/diagnostics.

## Implementation notes (optional)

- Strengthen wording in `.cursor/rules/` to explicitly ban *even local* edits on `main` for ticketed work.
- Consider a runtime preflight in `projects/hal-agents` (and/or server middleware) that checks branch and blocks “implementation mode” tool usage when on `main`.
- Ensure the system still allows non-ticket actions (e.g., reading code, answering questions) while on `main`.

## Audit artifacts required (implementation agent)

Create `docs/audit/<task-id>-enforce-no-main-changes-until-qa-merge/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)
- `pm-review.md` (use `docs/templates/pm-review.template.md`)