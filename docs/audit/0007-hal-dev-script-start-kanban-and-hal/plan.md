# Plan (0007-hal-dev-script-start-kanban-and-hal)

## Goal

Make `npm run dev` in the HAL repo start all required local services (HAL + Kanban) so the app’s main kanban section loads without "localhost refused to connect".

## Approach

- Add `concurrently` as a dev dependency for cross-platform parallel process execution.
- Add scripts:
  - `dev:hal` → `vite --port 5173 --strictPort` (HAL app)
  - `dev:kanban` → `npm --prefix projects/kanban run dev -- --port 5174 --strictPort` (kanban submodule)
  - `dev` → run both in parallel with clear labels (`concurrently -n hal,kanban`)
- Set `strictPort: true` in HAL’s `vite.config.ts` so port conflicts fail immediately rather than silently switching ports.
- Update the kanban loading overlay hint in `src/App.tsx` to tell users to run `npm run dev` from the repo root.
- KANBAN_URL in App.tsx already matches (5174); iframe target is unchanged.

## Files

- `package.json` — add concurrently, dev:hal, dev:kanban, update dev
- `vite.config.ts` — add strictPort: true
- `src/App.tsx` — update loading hint text
- `docs/audit/0007-hal-dev-script-start-kanban-and-hal/*`
