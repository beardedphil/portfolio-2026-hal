## Ticket

- **ID**: 0044
- **Title**: Wire Implementation Agent to Cursor API (MVP) and show request lifecycle in-app
- **Owner**: Implementation agent
- **Type**: Feature
- **Priority**: P0

## QA (implementation agent fills when work is pushed)

- **Branch**: `ticket/0044-implementation-agent-cursor-api-mvp-run`
- **QA report**: `docs/audit/0044-implementation-agent-cursor-api-mvp-run/qa-report.md` — Code review PASS; manual UI verification at http://localhost:5173 per verification.md recommended.

## Human in the Loop

- After QA merges, the ticket moves to **Human in the Loop**. The user tests at http://localhost:5173.

## Goal (one sentence)

Enable the new Implementation Agent to make a minimal end-to-end call via Cursor API and present progress/success/failure in the UI.

## Human-verifiable deliverable (UI-only)

When **Implementation Agent** is selected in the agent dropdown, the chat UI can trigger a run that shows an on-screen status timeline (e.g., “Preparing request → Sending to Cursor API → Waiting → Completed/Failed”), and the final result is visible in the chat thread without needing console logs.

## Acceptance criteria (UI-only)

- [x] With **Implementation Agent** selected, sending a chat message visibly starts a run and shows an in-app status/progress indicator.
- [x] If Cursor API is not configured, the UI shows a clear, user-readable error state (and does not attempt the request).
- [x] If Cursor API is configured, the UI shows a success state and displays the returned content in the chat.
- [x] If the Cursor API request fails, the UI shows a failure state with a human-readable error summary (no stack trace required).

## Constraints

- Keep this task as small as possible while still producing a **human-verifiable** UI change.
- Verification must require **no external tools** (no terminal, no devtools, no console).
- All meaningful state changes and errors must be visible in an in-app diagnostics/status UI.
- Do not display secrets.

## Non-goals

- Full implementation-agent workflow (branch creation, applying diffs, committing, pushing).
- Robust retries, queueing, or rate-limit handling beyond basic error reporting.
- Supporting multiple models/providers.

## Implementation notes (optional)

- Use the shared runner abstraction from ticket 0043 if available.
- Keep the MVP focused on: request → response → display, plus diagnostics.

## Audit artifacts required (implementation agent)

Create `docs/audit/0044-implementation-agent-cursor-api-mvp-run/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)
- `pm-review.md`