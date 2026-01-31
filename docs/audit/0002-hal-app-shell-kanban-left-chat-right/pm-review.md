# PM Review (0002-hal-app-shell-kanban-left-chat-right)

## Summary (1–3 bullets)

- Added a runnable HAL React/Vite/TS app with a two-column layout.
- Embedded the kanban board via iframe fallback and added a folder-picker “connect project” flow that passes Supabase creds to the iframe via `postMessage`.
- Implemented a stub chat UI (local messages + standup placeholder) and an in-app diagnostics panel.

## Likelihood of success

**Score (0–100%)**: 75%

**Why (bullets):**
- Core UI deliverable is straightforward and appears to match the ticket (layout + chat stub + diagnostics).
- Iframe fallback is a pragmatic choice for first integration.
- Main risk is integration fragility: two dev servers, `postMessage` origin requirements, and credential handoff across iframe boundary.

## What to verify (UI-only)

- The HAL app loads, shows two columns, and the right-side chat UX works (send + standup).
- The kanban iframe loads and remains interactive after connecting a folder; diagnostics correctly show connected project + last error.

## Potential failures (ranked)

1. **Kanban drag/drop looks “broken”** — cards drag but revert or won’t drop; likely because the embedded kanban’s data source isn’t persisting updates (Supabase write failing or not happening), so the next state refresh “snaps back.” Confirm using in-app diagnostics/action log inside the kanban UI (should expose last write error/success) and by checking whether the “connected” state is actually active.
2. **Connect Project Folder doesn’t connect** — folder picker works but kanban doesn’t change behavior; likely `postMessage` origin mismatch or the iframe hasn’t loaded when the message is sent. Confirm via HAL diagnostics: `kanbanLoaded` and last error; re-try after iframe shows Connected.
3. **Kanban iframe doesn’t load** — left pane stuck on loading overlay; likely the kanban dev server isn’t running on `http://localhost:5174` or port mismatch. Confirm via HAL diagnostics: `kanbanLoaded=false` and error text.
4. **Process trace gaps** — “ticket is done” but commits beyond `feat(0002)` may not all include the ticket ID in subject (if they were part of the ticket’s scope), which weakens auditability. Confirm by scanning commits after `feat(0002)` and checking linkage.

## Audit completeness check

- **Artifacts present**: plan / worklog / changed-files / decisions / verification / pm-review
- **Traceability gaps**:
  - `verification.md` includes terminal commands (starting dev servers). This is acceptable as a prerequisite, but verification steps should be as browser-only as possible after startup.
  - If later commits were required to satisfy 0002, they should include `0002` in the subject to preserve linkage.

## Follow-ups (optional)

- Bugfix ticket(s) in the kanban repo for DnD persistence and any UI gating regressions (e.g. Add Column disappearing when connected).
