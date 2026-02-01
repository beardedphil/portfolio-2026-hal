---
kanbanColumnId: col-done
kanbanPosition: 0
kanbanMovedAt: 2026-02-01T01:59:52.669+00:00
---
## Ticket

- **ID**: 0042
- **Title**: Add Cursor API configuration status panel in-app (no secrets)
- **Owner**: Implementation agent
- **Type**: Feature
- **Priority**: P1

## QA (implementation agent fills when work is pushed)

- **Branch**: `cursor/cursor-api-config-status-panel-5409`

## Human in the Loop

- After QA merges, the ticket moves to **Human in the Loop**. The user tests at http://localhost:5173.

## Goal (one sentence)

Expose a clear, non-technical in-app UI showing whether Cursor API is configured so later tickets can rely on it without console debugging.

## Human-verifiable deliverable (UI-only)

The HAL UI has a visible diagnostics/config section that shows **Cursor API: Configured** or **Cursor API: Not configured**, and when not configured it shows a clear explanation and what information is missing (without showing secrets).

## Acceptance criteria (UI-only)

- [ ] There is an in-app UI area (e.g., Diagnostics panel) that includes a row for **Cursor API** status.
- [ ] If Cursor API is not configured, the UI shows **Not configured** and names the missing items (e.g., “Missing CURSOR_API_KEY”) without revealing any actual secret values.
- [ ] If Cursor API is configured, the UI shows **Configured** and does not display secret values.
- [ ] The UI copy is understandable by a non-technical verifier (no stack traces, no console required).

## Constraints

- Keep this task as small as possible while still producing a **human-verifiable** UI change.
- Verification must require **no external tools** (no terminal, no devtools, no console).
- Do not log or render secrets (keys/tokens) anywhere in the UI.

## Non-goals

- Making a real Cursor API request.
- Storing secrets in Supabase.
- Supporting multiple providers (this is Cursor-only for now).

## Implementation notes (optional)

- This can initially read from environment configuration already available to the app runtime.
- Prefer a simple status enum plus a short explanation string so future tickets can reuse it.

## Audit artifacts required (implementation agent)

Create `docs/audit/0042-cursor-api-config-status-panel/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)
- `pm-review.md`