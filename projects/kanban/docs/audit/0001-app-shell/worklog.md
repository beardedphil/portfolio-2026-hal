# Worklog (0001-app-shell)

## 1. Scaffold
- Attempted `npm create vite@latest . -- --template react-ts`; operation cancelled in non-empty directory.
- Created project manually: `package.json` (React 18, Vite 6), `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `index.html`, `src/main.tsx`, `src/index.css`, `src/vite-env.d.ts`.
- Ran `npm install`; dependencies installed successfully.

## 2. App shell
- Implemented `src/App.tsx`: title "Portfolio 2026", subtitle "Project Zero: Kanban (coming soon)", Debug toggle button, conditional Debug panel.
- Debug panel: Build info (`import.meta.env.MODE`), Action Log (list with timestamp + message, cap at 20 entries), Error section (state `runtimeError`, display "No errors." when null).
- Action log: on each toggle, append "Debug toggled ON" or "Debug toggled OFF" with `formatTime()` (HH:mm:ss.mmm).
- Fixed log entry IDs: switched from incrementing `logId` in state to `Date.now()` inside `addLog` to avoid stale closures and ensure unique keys.

## 3. Styling
- Added minimal styles in `src/index.css`: body, #root, h1, .subtitle, .debug-toggle, .debug-panel, .build-info, .error-section, .empty.

## 4. Verification
- Started dev server (`npm run dev`); app opened at http://localhost:5173/.
- Confirmed in browser: title, subtitle, "Debug OFF" button visible; panel hidden by default.

## 5. Audit artifacts
- Created `docs/audit/0001-app-shell/` with `prompt.md`, `plan.md`, `worklog.md`, `changed-files.md`, `decisions.md`, `verification.md`.
