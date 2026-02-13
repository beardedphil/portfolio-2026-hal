# Worklog (0002-fix-debug-toggle-duplicate-action-log)

## 1. Reproduce and diagnose
- Read ticket and `src/App.tsx`. Confirmed: `addLog` was called inside `setDebugOpen((prev) => { ... })`. In StrictMode the updater runs twice per update, so one click produced two Action Log entries.

## 2. Fix duplicate log
- In `toggleDebug`: stopped using functional updater for side effects. Now: `const next = !debugOpen`; `setDebugOpen(next)`; `addLog(next ? 'Debug toggled ON' : 'Debug toggled OFF')`. Added `debugOpen` to the `useCallback` dependency array so the handler sees current state.

## 3. Total actions display
- In the Action Log section (Debug panel), added `<p className="action-log-summary">Total actions: {actionLog.length}</p>` above the list so a human can verify exactly N entries per N clicks.

## 4. Audit artifacts
- Created `docs/audit/0002-fix-debug-toggle-duplicate-action-log/` with `plan.md`, `worklog.md`, `changed-files.md`, `decisions.md`, `verification.md`.
