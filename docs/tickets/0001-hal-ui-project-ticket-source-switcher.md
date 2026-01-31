# Ticket

- **ID**: `0001`
- **Title**: HAL UI: show tickets from `portfolio-2026-hal` or `portfolio-2026-hal-agents` in the kanban board
- **Owner**: Implementation agent
- **Type**: Feature
- **Priority**: P0

## Linkage (for tracking)

- **Fixes**: (n/a)
- **Category**: (n/a)

## Goal (one sentence)

In the HAL app UI, let the user switch which project’s tickets are shown on the kanban board.

## Human-verifiable deliverable (UI-only)

A human can open the HAL app and:
- select **HAL** or **HAL Agents** in a Project dropdown
- see the **kanban cards** change to match the selected project
- use an in-app diagnostics panel to confirm which ticket source is currently active and when it last refreshed

## Acceptance criteria (UI-only)

- [ ] HAL (`portfolio-2026-hal`) is a React + Vite + TypeScript app that renders a two-column layout:
  - left: Kanban board area
  - right: (placeholder) Chat area
- [ ] In the left (kanban) area, there is a **Project** selector with at least two options:
  - `hal` (maps to `portfolio-2026-hal`)
  - `hal-agents` (maps to `portfolio-2026-hal-agents`)
- [ ] When the Project selector changes, the kanban board’s visible cards update to the selected project within 2 seconds (no page refresh).
- [ ] The app provides in-app diagnostics showing:
  - selected project id (`hal` / `hal-agents`)
  - ticket source type (for v0, pick **one** and implement it end-to-end):
    - Supabase polling, OR
    - docs-backed ticket store via File System Access API
  - last refresh time
  - last error (if any)
- [ ] If the ticket source is not configured (e.g., missing config), the app shows a **non-technical** error banner in the UI explaining what is missing.

## Constraints

- Keep this task as small as possible while still producing a **human-verifiable** UI change.
- Verification must require **no external tools** (no terminal, no devtools, no console).
- Add/extend **in-app** diagnostics as needed so failures are explainable from within the app.
- Scope discipline: do not implement “real” chat yet; it’s a placeholder panel for this ticket.

## Non-goals

- Implementing actual agent chat or standup logic
- Writing tickets into Supabase (read-only is fine for this first slice)
- Perfect styling (clean/usable is enough)

## Implementation notes (optional)

- The HAL superrepo contains submodules:
  - `projects/kanban` (Project 0 board)
  - `projects/project-1` (HAL Agents project repo)
- Prefer a small adapter interface like:
  - `getTickets(projectId) -> { tickets, lastRefresh, error }`
  - so we can swap storage later.

## Audit artifacts required (implementation agent)

Create `docs/audit/0001-hal-ui-project-ticket-source-switcher/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)
