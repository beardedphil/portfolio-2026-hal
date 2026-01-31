# QA Report: 0039 - Fix ticket deletion + UI actions to persist to Supabase

## 1. Ticket & deliverable

- **Goal:** Ensure that ticket actions performed in the Kanban UI (especially delete) are persisted to Supabase and reliably propagate (no “deleted tickets reappear”).
- **Human-verifiable deliverable:** In the embedded Kanban UI, a human can delete a ticket, wait up to ~10 seconds, and confirm the ticket does not reappear after refresh/reopen; the UI shows a clear “Deleted”/success confirmation in-app.
- **Acceptance criteria (from ticket):**
  - Deleting a ticket from the embedded Kanban UI removes it immediately from the ticket list and shows an in-app confirmation.
  - After waiting up to ~10 seconds (poll interval), the deleted ticket does not reappear without a manual refresh.
  - After a manual page refresh (Cmd/Ctrl+R), the deleted ticket still does not reappear.
  - If deletion fails (permission, network, Supabase error), the UI shows an in-app error message explaining that the delete did not persist.
  - All other ticket actions in the UI that change state (move column, edit body/title) persist after refresh/reopen.

## 2. Audit artifacts

All required artifacts are present in `docs/audit/0039-fix-ticket-deletion-and-ui-actions-persist-to-db/`:

- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md`

No `pm-review.md` is required by the ticket; other artifacts match the DoD.

## 3. Code review — PASS

Implementation matches the ticket and `changed-files.md`.

| Requirement | Implementation |
|-------------|----------------|
| Delete removes ticket immediately + in-app confirmation | `handleDeleteTicket` optimistically filters out ticket from `supabaseTickets`; sets `deleteSuccessMessage` with ticket label; green banner shows “✓ Deleted ticket …” (App.tsx 1318–1320, 2194–2197). |
| Success banner auto-dismiss | `setTimeout(() => setDeleteSuccessMessage(null), 5000)` (1320). |
| Deleted ticket does not reappear (poll/refresh) | Backend deletes **file first** then DB (vite.config.ts 418–431), so sync (Docs→DB) cannot re-import. Frontend delays refetch by 1.5s after success (1322–1324) to avoid race with file deletion. |
| Error message if delete fails | `setSupabaseLastDeleteError(err)`; banner “Delete failed: {error}” (2188–2191); auto-dismiss 10s (1331, 1338); addLog for Debug panel (1333, 1339). |
| Unconfigured Supabase | Early return with “Supabase not configured. Connect first.” (1298–1302). |
| Other actions persist | Move column / reorder already call Supabase + refetch (existing code); no change required; verification.md covers move/reorder/create. |

Backend (vite.config.ts):

- **File-before-DB order:** Lines 418–429 delete file first (`fs.unlinkSync`), then 431 deletes from Supabase. Comment: “CRITICAL: Remove the file BEFORE deleting from DB so sync (Docs→DB first) cannot re-insert the ticket.”
- File delete failure is logged and stored in `fileDeleteError`; DB delete still runs; response includes both errors if applicable (438–440).
- Sync runs after DB delete (444–464).

Frontend (App.tsx):

- Confirmation: `window.confirm(\`Delete ticket ${label}? This cannot be undone.\`)` (1305).
- Success: optimistic update, success message, 1.5s delay then `refetchSupabaseTickets()`, addLog, postMessage HAL_SYNC_COMPLETED (1316–1328).
- Error: set error state, 10s auto-dismiss, addLog (1329–1339).

Styles (index.css): `.success-message` (123–131) — green background #d4edda, border #c3e6cb, text #155724; matches error styling pattern.

Constraints verified:

- UI-only verification: no terminal/devtools required; success and error are in-app (banner + Debug panel).
- Supabase is source of truth; file deletion before DB prevents sync from resurrecting the ticket.
- In-app diagnostics: success banner, error banner, Action Log entries.

## 4. Build

- `npm run build` (repo root, branch `ticket/0039-fix-ticket-deletion-and-ui-actions-persist-to-db`): **Pass** (tsc + vite build complete).

## 5. UI verification

- **Automated:** Not run; full flow requires “Connect Project Folder” (native picker) and Supabase-connected board.
- **Manual:** Per `verification.md`, Human in the Loop runs at http://localhost:5173 **after** QA merges to `main` (dev server serves main only). QA did not execute manual test cases on the ticket branch because `npm run dev` is blocked off-main.

Recommended manual steps after merge (from verification.md):

1. **Test Case 1 – Delete (success):** Connect project → delete a ticket → confirm green “✓ Deleted ticket …” → wait ~10s → ticket stays gone → refresh → ticket still gone.
2. **Test Case 2 – Delete (error):** With Supabase disconnected or invalid, try delete → confirm “Delete failed: …” and ticket remains.
3. **Test Case 3–4 – Move/reorder:** Drag ticket to another column / reorder in column → wait ~10s → refresh → position persisted.
4. **Test Case 6 (optional):** Multiple rapid deletes → all show success → none reappear after wait + refresh.

## 6. Verdict

- **Implementation:** Complete and aligned with the ticket and plan. File-before-DB delete order, success/error banners, 1.5s refetch delay, and auto-dismiss are implemented as specified.
- **Merge:** **OK to merge** to `main`. After merge, move the ticket to **Human in the Loop** and run the manual verification steps above at http://localhost:5173.

**QA sign-off:** Code review and build pass. Manual UI verification is for Human in the Loop post-merge.
