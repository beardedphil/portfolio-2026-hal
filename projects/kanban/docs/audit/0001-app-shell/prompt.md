# Prompt (0001-app-shell)

You are an implementation agent. Build the smallest React + Vite + TypeScript webapp foundation for "Portfolio 2026 (HAL)".

## Constraints
- Keep this task as small as possible while still producing a **human-verifiable** UI change.
- Do not rely on console logs/devtools for verification; add **in-app** diagnostics.
- Create the audit artifacts described below.

## Deliverable (human-verifiable)
- App loads in the browser and shows:
  - Title: "Portfolio 2026"
  - Subtitle: "Project Zero: Kanban (coming soon)"
  - A **Debug toggle** (button or switch) in the UI
- Clicking Debug toggle shows/hides a Debug panel that displays:
  - App build info (at least: "dev" vs "prod" or `import.meta.env.MODE`)
  - A simple **Action Log** list showing the most recent UI actions (at least: "Debug toggled ON/OFF")
  - An **Error section** that would show any caught runtime error message (ok if empty for now)

## Technical requirements
- Use Vite React TS template.
- Keep styling minimal but readable.
- The app should run with `npm install` + `npm run dev`.

## Audit artifacts (required)
Create `docs/audit/0001-app-shell/` containing:
- `prompt.md` (paste this entire prompt)
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (steps a human can do in the UI; no console)

## Acceptance criteria (must all pass)
- A non-technical human can open the app and visually confirm the title/subtitle.
- A non-technical human can click the Debug toggle and see the Debug panel appear/disappear.
- The Debug panel shows mode/build info and an action log entry when toggled.
- Verification steps are written in `docs/audit/0001-app-shell/verification.md`.
