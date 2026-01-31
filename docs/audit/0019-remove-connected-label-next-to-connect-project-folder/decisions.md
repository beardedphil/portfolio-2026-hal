# Decisions: 0019 - Remove redundant "Connected" label next to Connect Project Folder

## D1: Hide status span only when project connected

- **Decision**: Render the `kanban-status` span only when `!connectedProject`. When a project is connected, do not render it.
- **Why**: When connected, the header already shows the project name and Disconnect; "Connected" is redundant. When not connected, the span still provides iframe load state ("Loading..." / "Connected" for kanban), so the UI is unchanged for the not-connected case.

## D2: No removal of "Loading..." when not connected

- **Decision**: Keep the span when not connected so "Loading..." (and optionally "Connected" for iframe) still appears next to the Connect button.
- **Why**: Ticket requires "When **not connected**, the UI looks unchanged (no new labels or spacing regressions)." Removing the span entirely would remove "Loading..." when not connected and could affect layout; conditional render preserves behavior.

## Unrequested changes

- None.
