# Title
Kanban: remove redundant “Connected” label next to Connect Project Folder

# Owner
Implementation agent

# Type
Bug

# Priority
P2

# Linkage
- Related: 0018 (similar request observed earlier in HAL chrome/header)

# Goal
Remove the always-visible “Connected” text shown next to the **Connect Project Folder** button in the embedded Kanban UI, because it appears even when no folder is connected and the UI already communicates connection state.

# Human-verifiable deliverable
In the embedded Kanban UI, next to the **Connect Project Folder** button, the word “Connected” no longer appears in any state.

# Acceptance criteria
- [ ] Open HAL and view the embedded Kanban UI: next to **Connect Project Folder**, there is **no** “Connected” label.
- [ ] Connect a project folder using **Connect Project Folder**: the “Connected” label still does **not** appear.
- [ ] Disconnect (or otherwise return to a disconnected state): the “Connected” label still does **not** appear.
- [ ] Kanban remains usable (no regression to loading, drag-and-drop, or basic navigation).

# Constraints
- Keep scope minimal: remove only this redundant label.
- Verification must be UI-only (no terminal/devtools/console).
- Do not change connection logic; only the UI label.

# Non-goals
- Redesigning the connect/disconnect UX.
- Removing other legitimate “connected” indicators in diagnostics/debug panels.
- Changing any similar label in HAL chrome outside the embedded Kanban UI.

# Implementation notes
- Likely within `projects/kanban/` (the embedded app). Search for render logic near the **Connect Project Folder** button and remove the adjacent “Connected” text entirely (all states).
- Be careful not to remove other uses of “Connected” that serve diagnostics.

# Audit artifacts
Create `docs/audit/<id>-kanban-remove-redundant-connected-label/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)
- `pm-review.md` (use `docs/templates/pm-review.template.md`)