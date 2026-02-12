# Plan (0002-fix-debug-toggle-duplicate-action-log)

## Goal
Toggling the Debug button must create exactly one Action Log entry per click (no duplicates). Add in-app "Total actions: N" so verification needs no external tools.

## Steps

1. **Identify cause**
   - Logging was inside the `setDebugOpen` state updater. React StrictMode double-invokes updaters in development, so each click produced two log entries.

2. **Fix logging**
   - Move the log call out of the state updater. In the click handler: compute `next = !debugOpen`, call `setDebugOpen(next)`, then call `addLog(...)` once. Logging runs once per user click.

3. **Add Total actions**
   - In the Action Log section, add a line "Total actions: N" (e.g. `<p className="action-log-summary">Total actions: {actionLog.length}</p>`) so a human can verify count without manual counting.

4. **Audit artifacts**
   - Create `docs/audit/0002-fix-debug-toggle-duplicate-action-log/` with `plan.md`, `worklog.md`, `changed-files.md`, `decisions.md`, `verification.md`.

## Out of scope
- No change to StrictMode; no ticket editing, kanban, routing, or persistence.
