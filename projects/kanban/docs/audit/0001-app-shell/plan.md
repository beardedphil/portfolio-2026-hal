# Plan (0001-app-shell)

## Goal
Deliver a minimal React + Vite + TypeScript app shell for "Portfolio 2026 (HAL)" with title, subtitle, Debug toggle, in-app Debug panel (build info, action log, error section), and full audit trail.

## Steps

1. **Scaffold Vite React TS**
   - Create project in repo root (existing `.cursor` and `docs` preserved).
   - Use `package.json`, `vite.config.ts`, `tsconfig*.json`, `index.html`, `src/main.tsx`, `src/index.css`, `src/vite-env.d.ts`.
   - Use React 18 and Vite 6 for broad compatibility.

2. **Implement app shell**
   - `src/App.tsx`: Title "Portfolio 2026", subtitle "Project Zero: Kanban (coming soon)".
   - Debug toggle: single button that shows "Debug ON" / "Debug OFF" and toggles visibility of the Debug panel.
   - On toggle: append to action log "Debug toggled ON" or "Debug toggled OFF" with a timestamp.

3. **Debug panel (visible when Debug ON)**
   - **Build info**: display `import.meta.env.MODE` (e.g. "dev" or "production").
   - **Action Log**: list of recent actions (e.g. last 20), each line: `[time] message`.
   - **Errors**: section that displays a runtime error message when set; show "No errors." when empty.

4. **Styling**
   - Minimal global styles in `src/index.css`: typography, spacing, Debug panel and button styles. No separate CSS framework.

5. **Audit artifacts**
   - Create `docs/audit/0001-app-shell/` with `prompt.md`, `plan.md`, `worklog.md`, `changed-files.md`, `decisions.md`, `verification.md`.

## Out of scope
- Error boundary or real error reporting (state and UI only; no wiring to catch errors yet).
- Tests, E2E, or console-based verification.
- Backend or routing.
