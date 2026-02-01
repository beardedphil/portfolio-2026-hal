---
kanbanColumnId: col-done
kanbanPosition: 0
kanbanMovedAt: 2026-02-01T17:12:57.105+00:00
---
## Ticket

- **ID**: 0045
- **Title**: Remove redundant “Active: {active_agent}” label
- **Owner**: Implementation agent
- **Type**: Chore
- **Priority**: P2

## QA (implementation agent fills when work is pushed)

- **Branch**: `ticket/0045-remove-redundant-active-agent-label` — QA performs code review + automated verification (no manual UI testing). When satisfied, QA merges to `main` and moves the ticket to **Human in the Loop**.

## Human in the Loop

- After QA merges, the ticket moves to **Human in the Loop**. The user tests at http://localhost:5173 — the dev server always serves `main`, so merged work is immediately testable.

## Goal (one sentence)

Remove redundant UI text that restates the currently selected agent.

## Human-verifiable deliverable (UI-only)

In the HAL UI, when you pick an agent from the agent dropdown (e.g. Project Manager or Implementation Agent), there is no separate on-screen text reading `Active: …` anywhere; the only visible indication of the active agent is the dropdown’s selected value.

## Acceptance criteria (UI-only)

- [ ] The UI does not display any `Active:` label for the selected agent anywhere in the app UI.
- [ ] Switching the agent via the agent dropdown still works normally, and the selected agent remains visible in the dropdown.
- [ ] No blank gap/extra row remains where the `Active: …` label previously appeared.

## Constraints

- Keep this task as small as possible while still producing a **human-verifiable** UI change.
- Verification must require **no external tools** (no terminal, no devtools, no console).
- Do not add a new setting or feature flag for this; remove the label unconditionally.

## Non-goals

- Redesigning the agent dropdown.
- Changing how the selected agent is stored/persisted.
- Changing any other status/diagnostics labels unrelated to the agent selector.

## Implementation notes (optional)

- This label is redundant because the dropdown already communicates the active agent; remove it rather than hiding it conditionally.

## Audit artifacts required (implementation agent)

Create `docs/audit/0045-remove-redundant-active-agent-label/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)