# Ticket

- **ID**: `0007`
- **Title**: HAL dev: `npm run dev` starts HAL + Kanban together
- **Owner**: Implementation agent
- **Type**: Chore
- **Priority**: P0

## Linkage (for tracking)

- **Fixes**: (n/a)
- **Category**: (n/a)

## Goal (one sentence)

Make `npm run dev` in the HAL repo start **all required local services** so the app’s main kanban section loads without “localhost refused to connect”.

## Human-verifiable deliverable (UI-only)

A human can run **one** command (`npm run dev`) and then open the HAL app in a browser and see:
- the **Kanban board area** (left) loads (no “localhost refused to connect”),
- the **Chat area** (right) is usable.

## Acceptance criteria (UI-only)

- [ ] Running **only** `npm run dev` from the HAL repo root is sufficient to make the HAL UI usable (no requirement to start additional dev servers manually).
- [ ] The kanban iframe loads successfully (no “localhost refused to connect”) in the default HAL view.
- [ ] The solution is stable across restarts:
  - [ ] If the required port(s) are unavailable, the failure mode is clear (either a clear in-app message/diagnostic or a clear, immediate dev-server failure rather than silently switching to a different port and breaking the iframe).
- [ ] No secrets are introduced into the client bundle as part of this change.

## Constraints

- Keep this task as small as possible.
- Prefer a cross-platform approach that works on Windows (this repo’s primary dev OS).
- HAL currently embeds kanban via an iframe pointed at a fixed URL; avoid “auto-picking a new port” behaviors that break the embed unless the embed URL is also made dynamic (in a minimal, auditable way).
- Avoid introducing extra long-running services unless required (goal is “start what we already need”).

## Non-goals

- Adding production orchestration (Docker, full backend, process supervisors beyond local dev).
- Changing HAL’s overall UI layout or kanban integration approach beyond what’s needed for reliable local dev startup.

## Implementation notes (optional)

- Suggested approach: use a small process runner (e.g. `concurrently` / `npm-run-all`) and add scripts like:
  - `dev:hal` → `vite --port 5173` (or another fixed port)
  - `dev:kanban` → `npm --prefix projects/kanban run dev -- --port 5174 --strictPort`
  - `dev` → run both in parallel with clear labels
- Ensure the iframe target in `src/App.tsx` matches the chosen kanban port.

## Audit artifacts required (implementation agent)

Create `docs/audit/0007-hal-dev-script-start-kanban-and-hal/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)
- `pm-review.md`

