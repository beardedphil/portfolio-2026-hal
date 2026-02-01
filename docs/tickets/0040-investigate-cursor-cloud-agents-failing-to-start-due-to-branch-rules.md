---
kanbanColumnId: col-done
kanbanPosition: 0
kanbanMovedAt: 2026-02-01T01:59:25.553+00:00
---
## Ticket

- **ID**: 0040
- **Title**: Investigate why Cursor cloud agents cannot start (possible conflict with branch/commit rules)
- **Owner**: Implementation agent
- **Type**: Bug
- **Priority**: P0

## Linkage (for tracking)

- **Category**: Process

## QA (implementation agent fills when work is pushed)

- **Branch**: `ticket/0040-investigate-cursor-cloud-agent-start-failure`

## Human in the Loop

- After QA merges, the ticket moves to **Human in the Loop**. The user tests at http://localhost:5173 — the dev server always serves `main`, so merged work is immediately testable.

## Goal (one sentence)
Identify and remove the blocker preventing Cursor cloud agents from starting/working in this repo while keeping our auditability and branching discipline.

## Human-verifiable deliverable (UI-only)
A human can start a Cursor cloud agent for this repo from the HAL UI (or Cursor UI, whichever is our normal flow) and see it reach a clear “running/connected” state with no immediate failure message.

## Acceptance criteria (UI-only)
- [ ] A human can start a cloud agent and it reaches a “running/connected” state (no immediate failure) using the normal UI flow.
- [ ] If the cloud agent fails to start, the failure is shown in an in-app/visible UI message with the actionable root cause (not just console logs).
- [ ] The investigation concludes with a documented root cause tied to a specific rule/assumption (e.g., mandatory local git branch creation, commit/push expectations, filesystem write expectations) and a concrete fix.
- [ ] If our rules require modification for cloud agents, the updated rule(s) still preserve: (1) no edits on `main` in the primary repo, (2) traceable work via commits/PRs, and (3) user-verifiable UI acceptance criteria.

## Constraints
- Keep this task as small as possible while still producing a **human-verifiable** improvement (cloud agents can start).
- Verification must require **no external tools** (no terminal, no devtools, no console) for the human verifier.
- Prefer fixes that are compatible with both local agents and cloud agents.

## Non-goals
- Migrating away from Cursor cloud agents entirely.
- Redesigning the whole branching/audit process beyond what’s required to unblock cloud agents.

## Implementation notes (optional)
- Hypothesis: cloud agents run in an isolated workspace that may not allow `git checkout -b ...` or may not have authenticated push; our rules currently instruct agents to create branches and push.
- Investigate where the failure occurs: agent bootstrap, git operations, write permissions, network/auth, or repo policy enforcement.
- Potential resolution options: allow cloud agents to work on a detached HEAD and open PRs via API; or adjust rules to say “cloud agents must work on a feature branch OR an isolated workspace branch that maps to a PR branch created by the platform”; or add detection + alternate workflow guidance.

## Audit artifacts required (implementation agent)
Create `docs/audit/0040-investigate-cursor-cloud-agent-start-failure/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)