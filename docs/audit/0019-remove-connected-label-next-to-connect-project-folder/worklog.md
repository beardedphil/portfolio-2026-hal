# Worklog: 0019 - Remove redundant "Connected" label next to Connect Project Folder

## Session 1

### Analysis

- Read ticket 0019: remove redundant "Connected" label next to Connect Project Folder; keep connection state clear via Diagnostics.
- Located in `src/App.tsx`: `kanban-header-actions` contains Connect button (or project name + Disconnect) and a `kanban-status` span showing `kanbanLoaded ? 'Connected' : 'Loading...'`.
- When a project is connected, the project name and Disconnect are already shown; the "Connected" label is redundant.

### Implementation

- Wrapped the `kanban-status` span in `{!connectedProject && (...)}` so it renders only when no project is connected.
- When not connected: UI unchanged (span still shows "Loading..." or "Connected" for iframe).
- When connected: redundant "Connected" label no longer shown; connection state remains clear via Diagnostics "Connected project:" and the project name in the header.

### Verification

- No TypeScript or lint errors.
- Build succeeds.
