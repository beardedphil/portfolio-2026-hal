# PM Review (0018-show-add-column-when-project-folder-connected)

## Summary (1–3 bullets)

- Ensured “Add column” remains visible when the docs-backed Ticket Store is connected.
- Routed “create column” and duplicate checks to the correct column state depending on mode (Ticket Store vs local).
- Added a Debug-panel button to connect Ticket Store from the UI (supporting UI-only verification).

## Likelihood of success

**Score (0–100%)**: 85%

**Why (bullets):**
- Change is localized to gating + display/source-of-truth for columns/cards.
- Verification steps are concrete and use in-app controls (Debug panel) to connect Ticket Store.

## What to verify (UI-only)

- Connect Ticket Store via Debug and confirm Add column is visible and creates a new column immediately.
- Confirm Supabase mode still behaves as intended (if Add column is meant to be hidden in that mode).

## Potential failures (ranked)

1. **Add column visible but column doesn’t appear** — would indicate create handler is writing to a different state than the one used for rendering; confirm by checking the Debug kanban summary.
2. **Duplicate column prevention inconsistent across modes** — if duplicate checks now include the wrong set of columns; confirm by trying to add an existing title while Ticket Store is connected.
3. **UI gating regression in Supabase mode** — Add column may show when it shouldn’t, causing confusing duplicates. Confirm by connecting Supabase and observing column list.

## Audit completeness check

- **Artifacts present**: plan / worklog / changed-files / decisions / verification / pm-review
- **Traceability gaps**:
  - `verification.md` includes dev-server prerequisites; acceptable as setup, but keep verification browser-only after startup.

## Follow-ups (optional)

- If Supabase mode should never allow custom columns, enforce that in UI gating (and add a specific regression test step).
