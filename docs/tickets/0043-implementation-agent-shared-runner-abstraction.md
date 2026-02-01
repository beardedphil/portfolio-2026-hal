## Ticket

- **ID**: 0043
- **Title**: Abstract shared “agent runner” logic used by Project Manager for reuse by Implementation Agent
- **Owner**: Implementation agent
- **Type**: Chore
- **Priority**: P1

## QA (implementation agent fills when work is pushed)

- **Branch**: `ticket/0043-implementation-agent-shared-runner-abstraction`

## Human in the Loop

- After QA merges, the ticket moves to **Human in the Loop**. The user tests at http://localhost:5173.

## Goal (one sentence)

Refactor the existing Project Manager agent execution logic into a reusable abstraction that the new Implementation Agent can share without changing user-visible behavior.

## Human-verifiable deliverable (UI-only)

In the HAL UI, the Project Manager agent continues to function as before, and the Diagnostics UI includes a visible line indicating which “runner” implementation is being used (e.g., “Agent runner: v2 (shared)” ) so a human can confirm the refactor shipped.

## Acceptance criteria (UI-only)

- [ ] Project Manager agent still produces responses in the chat UI after the refactor (basic smoke test).
- [ ] The app’s in-app diagnostics shows a visible indicator that the shared runner/abstraction is active.
- [ ] No new buttons/toggles are required to verify the change; a human can verify via normal PM usage plus the diagnostics line.

## Constraints

- Keep this task as small as possible while still producing a **human-verifiable** UI change.
- Verification must require **no external tools** (no terminal, no devtools, no console).
- Do not change PM features/UX beyond adding the diagnostics indicator.

## Non-goals

- Implementing Cursor API integration.
- Adding Implementation Agent behavior beyond structural plumbing.
- Changing ticket/kanban behavior.

## Implementation notes (optional)

- Target likely areas: the Project Manager agent and its tool wiring (in `projects/hal-agents/src/agents/`), plus the app integration that selects agents.
- Prefer a small “runner” interface that can later support both “Cursor App” and “Cursor API” backends.

## Audit artifacts required (implementation agent)

Create `docs/audit/0043-implementation-agent-shared-runner-abstraction/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)
- `pm-review.md`