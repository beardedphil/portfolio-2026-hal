---
kanbanColumnId: col-done
kanbanPosition: 0
kanbanMovedAt: 2026-02-01T17:12:18.715+00:00
---
# Title
Remove Add column and Debug toggle UI (prescriptive mode)

# Owner
PM

# Type
Feature

# Priority
High

## Goal (one sentence)
Remove end-user access to the Kanban board’s “Add column” and “Debug OFF/ON” controls and disable their related UI functionality so the board is prescriptive and cannot be modified through those controls.

## Human-verifiable deliverable (UI-only)
In the embedded Kanban UI:
- The “Add column” button is no longer visible anywhere.
- The “Debug OFF/ON” button (or any debug toggle control) is no longer visible anywhere.
- A non-technical user can load the Kanban UI and confirm there is no way in the UI to add columns or toggle debug mode.

## Acceptance criteria (UI-only)
- [ ] In the embedded Kanban UI, the “Add column” control is not shown in any state (initial load, after refresh, after interacting with the board).
- [ ] In the embedded Kanban UI, the “Debug OFF/ON” control (debug toggle) is not shown in any state.
- [ ] Attempting normal usage (drag cards, open ticket details, move tickets where allowed) does not reveal any UI pathway to add columns.
- [ ] The board’s columns remain usable and rendered normally; only the add-column + debug-toggle UI is removed/disabled.

## Constraints
- Must remove/disable both the **buttons** and any related UI behavior they expose (no dead/hidden controls that can reappear via normal UI interactions).
- Do not add new configuration surfaces unless required; prefer hard-disable/removal for now.
- No console/devtools required for verification; verification is purely by observing the UI.

## Non-goals
- Implementing a role-based permissions system for column management.
- Changing the underlying database schema or server-side policies.
- Altering other Kanban functionality (ticket creation, drag/drop, details modal) beyond what is necessary to remove these two controls.