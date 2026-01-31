# Title
Bug: Will Not Implement column reverts to Unassigned on refresh

# Owner
PM

# Type
Bug

# Priority
P1

# Linkage
- Related: `docs/tickets/0031-kanban-allow-agents-to-move-tickets-between-controlled-columns-doingready-for-qadonewont-implement.md`

# Ready for verification
- **Branch**: `ticket/0032-bug-will-not-implement-column-reverts-to-unassigned-on-refresh` — QA (or the user) checks out this branch to verify, then merges to `main`.

# Goal (one sentence)
Ensure that when a ticket is moved to **Will Not Implement**, that state persists after refreshing/reopening the embedded Kanban UI.

# Human-verifiable deliverable (UI-only)
A human can move a ticket card to the **Will Not Implement** column in the embedded Kanban UI, refresh the page (or close/reopen the Kanban UI), and the ticket remains in **Will Not Implement**.

# Acceptance criteria (UI-only)
- [ ] Moving a ticket to **Will Not Implement** persists after refresh/reopen (does not return to **Unassigned**).
- [ ] The ticket’s column shown in the UI matches the persisted source of truth (e.g., the ticket detail view, or any in-app diagnostics view that shows `kanban_column_id`).
- [ ] If persisting the move fails (network/permissions), the UI displays an in-app error and the ticket does not silently revert.

# Constraints
- Scope is the embedded Kanban UI (`projects/kanban/`) and any HAL/agent sync surfaces needed to persist column changes.
- Do not rely on console/devtools for verification; use UI-only steps.
- Prefer a minimal fix that addresses persistence/serialization rather than a broad refactor.

# Non-goals
- Adding new workflow columns or redefining column semantics.
- Implementing a full role-based permission system.

# Implementation notes
- Suspect either (a) the move is only local UI state and not persisted, (b) the persistence layer rejects/normalizes the **Will Not Implement** column id, or (c) a refresh-time “sync” overwrites the stored column with a default (Unassigned).
- Start by tracing: what field stores the column (likely `kanban_column_id`), where it is written on drag/drop or move, and what refresh-time fetch/mapping does.

# Audit artifacts
- Standard audit artifacts under `docs/audit/<task-id>-<short-title>/` (plan, worklog, changed-files, decisions, verification, pm-review).