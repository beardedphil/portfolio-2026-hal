# Worklog (0007-hal-dev-script-start-kanban-and-hal)

- Read ticket 0007 and implementation notes (concurrently / npm-run-all; fixed ports 5173/5174; strictPort).
- Added `concurrently` as devDependency in `package.json`.
- Added `dev:hal` script: `vite --port 5173 --strictPort`.
- Added `dev:kanban` script: `npm --prefix projects/kanban run dev -- --port 5174 --strictPort`.
- Updated `dev` script to run both in parallel: `concurrently -n hal,kanban -c blue,yellow "npm run dev:hal" "npm run dev:kanban"`.
- Set `strictPort: true` in `vite.config.ts` server config for HAL.
- Updated kanban loading overlay hint in `src/App.tsx` from "cd projects/kanban && npm run dev" to "Run npm run dev from the repo root to start HAL and Kanban together."
- Created audit folder and artifacts: plan, worklog, changed-files, decisions, verification, pm-review.
