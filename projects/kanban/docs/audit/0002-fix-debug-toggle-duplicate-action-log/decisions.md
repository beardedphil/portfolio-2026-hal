# Decisions (0002-fix-debug-toggle-duplicate-action-log)

## Log outside state updater
- **Decision:** Call `addLog` in the click handler after `setDebugOpen(next)`, not inside the functional updater.
- **Reason:** React StrictMode double-invokes state updaters in development. Side effects (like logging) inside updaters run twice per click. Running the log once in the handler guarantees one entry per click.

## Use closure state for next value
- **Decision:** Compute `next = !debugOpen` in the handler and use it for both `setDebugOpen(next)` and the log message.
- **Reason:** Keeps a single source of truth for "next" and avoids a ref or effect. Safe because the handler runs in response to one user click and sees the current `debugOpen` at that time.

## Total actions in UI
- **Decision:** Add "Total actions: N" (from `actionLog.length`) in the Action Log section.
- **Reason:** Ticket requires human-verifiable count without manual counting or external tools; the number makes it obvious that 5 clicks yield 5 new entries.

## No StrictMode change
- **Decision:** Leave StrictMode enabled in `main.tsx`.
- **Reason:** Fix addresses the symptom (duplicate log) by avoiding side effects in updaters; StrictMode remains valuable for catching similar issues elsewhere.
