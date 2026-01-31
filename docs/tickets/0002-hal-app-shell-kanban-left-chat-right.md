# Ticket

- **ID**: `0002`
- **Title**: HAL app shell: kanban-left + chat-right (React/Vite/TS)
- **Owner**: Implementation agent
- **Type**: Feature
- **Priority**: P0

## Linkage (for tracking)

- **Fixes**: (n/a)
- **Category**: (n/a)

## Goal (one sentence)

Turn `portfolio-2026-hal` into a runnable React + Vite + TypeScript app that shows the kanban board on the left and a chat UI on the right.

## Human-verifiable deliverable (UI-only)

A human can run HAL and see:
- a **two-column** app layout
- **left**: the kanban UI (rendered inside HAL)
- **right**: a chat UI (agent selector, transcript area, message composer) plus a “Standup” button that produces placeholder updates
- an in-app diagnostics panel showing which kanban source is currently rendered and any runtime errors (no console required)

## Acceptance criteria (UI-only)

- [ ] HAL (`portfolio-2026-hal`) contains a standard React/Vite/TS app at repo root:
  - `index.html`, `vite.config.ts`, `tsconfig.*`, `src/main.tsx`, `src/App.tsx`, `src/index.css`
- [ ] The HAL UI is a two-column layout:
  - left: kanban board region
  - right: chat region
- [ ] The kanban board region renders the Project 0 board UI from `projects/kanban/` **inside HAL**.
  - If direct embedding/import is not possible in this slice, implement a **temporary** fallback that still shows the board in the left column and is verifiable without devtools (documented in `decisions.md`).
- [ ] Chat region includes:
  - an **Agent** dropdown (at least: `Project Manager`, `Implementation Agent (stub)`)
  - a message list (transcript)
  - a message input + Send button (messages can be local-only for now)
  - a “Standup (all agents)” button that appends a placeholder standup summary to the transcript (local-only is fine)
- [ ] In-app diagnostics region exists (can live inside chat column):
  - current kanban render mode (e.g. “embedded component”, “fallback iframe”, etc.)
  - selected agent
  - last error (if any)
- [ ] No console/devtools are required to verify any of the above.

## Constraints

- Keep this task as small as possible while still producing a **human-verifiable** UI change.
- Verification must require **no external tools** (no terminal, no devtools, no console).
  - Starting the dev server is acceptable if unavoidable, but verification steps should be browser-only after that.
- Add/extend **in-app** diagnostics as needed so failures are explainable from within the app.
- Scope discipline: do not implement real LLM/agent infrastructure yet; stubs are fine.

## Non-goals

- Real agent execution, tool use, or standup logic
- Persisted chat history
- Multi-user auth

## Implementation notes (optional)

- `portfolio-2026-hal` is a superrepo with submodules:
  - `projects/kanban` (Project 0 board UI)
  - `projects/project-1` (HAL Agents project)
- Preferred approach is to **reuse** the kanban code rather than copy/paste it.
- If you need a small adapter layer to embed the kanban board cleanly, keep it minimal and document it.

## Audit artifacts required (implementation agent)

Create `docs/audit/0002-hal-app-shell-kanban-left-chat-right/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)
