---
kanbanColumnId: col-done
kanbanPosition: 0
kanbanMovedAt: 2026-02-01T01:59:48.154+00:00
---
## Ticket

- **ID**: 0041
- **Title**: Add “Implementation Agent” to agent dropdown (stubbed) and show in-app diagnostics
- **Owner**: Implementation agent
- **Type**: Feature
- **Priority**: P1

## QA (implementation agent fills when work is pushed)

- **Branch**: `ticket/0041-implementation-agent-phase-1-ui-selection-and-stub`

## Human in the Loop

- After QA merges, the ticket moves to **Human in the Loop**. The user tests at http://localhost:5173.

## Goal (one sentence)

Allow a user to select “Implementation Agent” from the same agent dropdown used for Project Manager and see a clear in-app “not implemented yet” status.

## Human-verifiable deliverable (UI-only)

In the HAL chat UI, the agent selection dropdown includes an option named **Implementation Agent**; selecting it changes the visible “active agent” indicator for the conversation and shows an on-screen diagnostics/status message explaining that the Implementation Agent is not wired to Cursor API yet.

## Acceptance criteria (UI-only)

- [ ] The agent selection dropdown shows an option labeled **Implementation Agent** alongside existing agents.
- [ ] Selecting **Implementation Agent** visibly changes the conversation’s active agent indicator (so a human can confirm the selection “took”).
- [ ] When **Implementation Agent** is selected, the UI shows an on-screen message (not console) stating that the agent is currently a stub / not yet connected to Cursor API.
- [ ] The message includes a short “what to do next” hint (e.g., “Cursor API not configured yet” or “Implementation Agent will be enabled in a later ticket”) without referencing terminal commands.

## Constraints

- Keep this task as small as possible while still producing a **human-verifiable** UI change.
- Verification must require **no external tools** (no terminal, no devtools, no console).
- Add/extend **in-app** diagnostics/status UI as needed so failures are explainable from within the app.
- Do not add any API keys or secrets to the UI.

## Non-goals

- Implementing the actual Implementation Agent behavior (running code changes, creating branches, editing files).
- Integrating with the Cursor API.
- Changing Project Manager behavior.

## Implementation notes (optional)

- Reuse the same selection mechanism as Project Manager (same dropdown) so the only new behavior is the additional option and the stubbed status/diagnostics.
- Keep the stub response deterministic so verification is simple.

## Audit artifacts required (implementation agent)

Create `docs/audit/0041-implementation-agent-phase-1-ui-selection-and-stub/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)
- `pm-review.md`