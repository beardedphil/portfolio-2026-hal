# QA Report: 0030 - Ticket list: add Delete button and sync deletion to filesystem

## 1. Ticket & deliverable

- **Goal:** Allow a user to delete a ticket from the UI and have that deletion propagate to Supabase and the local `docs/tickets/` filesystem via the existing sync mechanism.
- **Human-verifiable deliverable:** In the app’s ticket list/board UI, each ticket row/card has a visible **Delete** action; when clicked and confirmed, the ticket disappears from the UI and is removed from the local `docs/tickets/` folder after the app runs the sync step.
- **Acceptance criteria (from ticket):**
  - Each ticket item shows a **Delete** button (or overflow menu item) that is discoverable and consistent across ticket list views.
  - Clicking **Delete** prompts for confirmation (to prevent accidental deletion).
  - After confirming, the ticket is deleted in the backend (Supabase) and no longer appears in the UI after refresh.
  - After deletion, the app triggers the existing sync process and the corresponding markdown file under `docs/tickets/<id>-<slug>.md` is removed locally.
  - If deletion or sync fails, the user sees an in-app error state in the diagnostics/debug UI describing what failed.

## 2. Audit artifacts

All required artifacts are present in `docs/audit/0030-ticket-list-add-delete-button-and-sync-deletion-to-filesystem/`:

- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md`
- `pm-review.md`

## 3. Code review — PASS

Implementation matches the ticket and `changed-files.md`:

| Requirement | Implementation |
|-------------|----------------|
| Delete button on each ticket card | `SortableCard` shows a **Delete** button when `showDelete && onDelete`; `SortableColumn` passes `onDeleteTicket={handleDeleteTicket}` and `showDelete={supabaseBoardActive}` (App.tsx 356–368, 1320–1321). |
| Discoverable and consistent | Button is visible on every card when Supabase board is active; `.ticket-card-delete` styled in index.css (241–253). |
| Confirmation before delete | `handleDeleteTicket` uses `window.confirm(\`Delete ticket ${label}? This cannot be undone.\`)` and returns if user cancels (679). |
| Delete in backend + refetch | POST to `HAL_API_BASE/api/tickets/delete` with `ticketId`, `supabaseUrl`, `supabaseAnonKey`; on success `refetchSupabaseTickets()` and ticket disappears from UI (686–691). |
| Sync after delete (remove local file) | `vite.config.ts` tickets-delete-endpoint: after Supabase delete, spawns `scripts/sync-tickets.js` with SUPABASE_URL/SUPABASE_ANON_KEY; `sync-tickets.js` deletes local files for ticket IDs in docs but no longer in Supabase (vite.config 352–437, sync-tickets.js 158–170). |
| Error in Debug panel and in-app | `supabaseLastDeleteError` set on API failure; shown in Debug panel as "Last delete error" (1374) and in-app banner "Delete failed: {error}" (1215–1219). |

Constraints verified:

- Uses existing sync-tickets approach (endpoint runs sync after delete; no separate manual step).
- Deletion is safe: explicit `window.confirm` before calling API.
- No terminal/devtools required: errors shown in Debug panel and banner.
- Deletion scoped to ticket’s markdown file only: sync removes only files in `docs/tickets/` whose id is no longer in Supabase.

## 4. Build

- `npm run build` (repo root): **Pass** (tsc + vite build complete).

## 5. UI verification — Manual

Automated end-to-end verification was not run because **Connect Project Folder** uses the native directory picker (not automatable), and the Supabase board must be connected with at least one ticket in the DB.

Manual steps (from `verification.md`):

1. **Delete button visible:** Open HAL; connect the project folder. Confirm the Kanban board shows tickets in columns. Locate a ticket card; confirm a **Delete** button is visible on each card when Supabase is connected.
2. **Confirmation dialog:** Click Delete; confirm a dialog appears (e.g. "Delete ticket ...? This cannot be undone."). Click Cancel; confirm the ticket remains.
3. **Delete and sync:** Click Delete again; confirm; click OK. Confirm the ticket disappears from the UI (within poll interval or after refresh). Confirm the corresponding file under `docs/tickets/<id>-<slug>.md` is removed on disk.
4. **Error display:** If deletion or sync fails, confirm an error appears in the Debug panel (Last delete error) and in the in-app banner ("Delete failed: ...").

## 6. Verdict

- **Implementation:** Complete and matches the ticket and plan. Delete button, confirmation, API delete, sync-tickets (including removal of local file), and error reporting are all implemented as specified.
- **Merge:** OK to merge after **manual UI verification** above is run (connect project, confirm Delete on cards, confirm dialog, cancel, then confirm delete and verify ticket gone and file removed; optionally verify error display on failure).
