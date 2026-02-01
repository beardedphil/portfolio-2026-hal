# QA Report: 0047 — Investigate Kanban card column moves reverting (sync/persistence)

## 1. Ticket & deliverable

- **Goal:** Identify and fix the root cause that makes Kanban cards “snap back” to previous columns after a refresh or dev-server restart.
- **Deliverable:** After moving a ticket card to a different column, waiting ≥30s, and refreshing (or restarting the dev server), the card remains in the new column. In-app error message if persistence fails; UI indicators for “Last tickets refresh” and “Last move persisted/failed.”
- **Acceptance criteria:** Persistence after 30s + refresh; persistence across dev-server restart; in-app error on persistence failure; visible “Last tickets refresh” and “Last move persisted/failed” indicators.

## 2. Branch & audit

- **Branch verified:** `origin/ticket/0047-implementation` (ticket lists `ticket/0047-investigate-kanban-moves-reverting` — same work, naming variance).
- **Audit folder:** `docs/audit/0047-kanban-cards-snap-back-after-refresh/` (on branch; short title differs from ticket filename).

All required audit artifacts are present:

- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md`
- `pm-review.md`

## 3. Definition of Done check

| DoD item | Status |
|----------|--------|
| Ticket exists | Ticket `docs/tickets/0047-investigate-kanban-card-column-moves-reverting-possible-sync-tickets-overwrite.md` exists in workspace; **not** on branch (created/untracked after branch). Traceability gap: ticket file should be on branch or merged from main before final merge. |
| Audit folder + artifacts | Present on branch. |
| Work committed + pushed | Yes — `feat(0047): fix Kanban cards snapping back after refresh` on `origin/ticket/0047-implementation`. |
| Build | Pass — `npm run build` succeeds (root). |
| Lint | No `npm run lint` at repo root; verification.md states “No linter errors” (N/A). |

## 4. Code review — PASS

Implementation in `projects/kanban/src/App.tsx` and `projects/kanban/src/index.css` matches the ticket and `changed-files.md`:

| Requirement | Implementation |
|-------------|----------------|
| Pending moves tracking | `pendingMoves` state (Set&lt;string&gt;), add before optimistic update, remove after persist/fail (lines 775–776, 1934, 1951–1956, 1961–1966, 1989, etc.). |
| Refetch skip pending | `refetchSupabaseTickets(skipPendingMoves)`; when `true`, merges DB data but keeps optimistic rows for tickets in `pendingMoves` (lines 1235–1294). |
| Polling skips pending | `setInterval(() => refetchSupabaseTickets(true), …)` (lines 1386–1391). |
| In-app error on failure | `lastMovePersisted` state with `success: false` and `error`; banner with `config-missing-error` and alert role (lines 1960–1967, 2301–2310). |
| Last tickets refresh | `supabaseLastRefresh` shown in debug panel (verification.md; debug section ~2634). |
| Last move persisted/failed | Debug panel shows `lastMovePersisted` with ticket ID and timestamp; success/error styling (lines 2634–2637, 2642–2644). |
| Auto-dismiss success | `AutoDismissMessage` for success banner (lines 2314–2316, 322). |
| CSS for status | `.debug-success`, `.debug-error`, `.debug-warning` in `index.css`. |

Root cause (stale refetch overwriting optimistic update) is addressed: pending moves are preserved during polling; full refetch only after move completes (success or failure); 1.5s delay before clearing pending so DB write is visible.

## 5. Verification.md line references

Verification.md cites line ranges (e.g. 1918–1976) that do not match current line numbers (logic is in ~1933–1970, 1235–1294, 1386–1391). Implementation is present; consider updating verification.md line refs for future audits.

## 6. UI verification — Manual (Human in the Loop)

Automated UI verification was not run (Supabase + project connection required). Manual steps from `verification.md`:

1. **Persistence after 30s + refresh:** Connect Supabase, move a card (e.g. To-do → Doing), wait ≥30s, refresh. **Expected:** Card stays in new column.
2. **Persistence across dev-server restart:** Move a card, wait 30s, restart dev server, reload app. **Expected:** Card stays in new column.
3. **Error handling:** Simulate failure (e.g. disconnect); move a card. **Expected:** In-app error message; card reverts.
4. **Indicators:** Open debug panel; move a card. **Expected:** “Last tickets refresh,” “Last move persisted/failed,” and “Pending moves” visible as described.

## 7. Verdict

- **Implementation:** Complete and matches the ticket and plan. Scope limited to reversion fix and in-app diagnostics; no schema or column list changes.
- **Merge:** OK to merge to `main` after **manual UI verification** above (Human in the Loop). Then move ticket to **Human in the Loop** for user testing at http://localhost:5173.

**Traceability:** Add ticket file `docs/tickets/0047-investigate-kanban-card-column-moves-reverting-possible-sync-tickets-overwrite.md` to the branch (or ensure it exists on main and is included in merge) so DoD “ticket file exists in git history on the branch” is satisfied.
