---
kanbanColumnId: col-wont-implement
kanbanPosition: 0
kanbanMovedAt: 2026-01-31T22:02:16.708+00:00
---
# Title
Persist project folder connection across rebuild / reload

# Owner
Implementation agent

# Type
Feature

# Priority
P2

# Linkage
- Related: 0010 (persist conversations; this ticket persists the folder handle so “Connect project folder” survives reload)

# Goal
Store the project folder handle (from the File System Access API) in IndexedDB and restore it on app load so that after a page refresh or rebuild the user does not have to click “Connect project folder” again, as long as the browser still has permission.

# Human-verifiable deliverable
After connecting a project folder in HAL (or in Kanban when used standalone), the user can refresh the page or rebuild the app and the same project remains connected without re-picking the folder, when the browser has retained permission.

# Acceptance criteria
- [ ] **HAL (main app):** User connects a project folder, then refreshes the page (or rebuilds and reloads). The same project is still connected (conversations, Kanban iframe, etc.) without showing the folder picker again, when permission is still granted.
- [ ] **HAL:** If the user has revoked folder access in browser settings (or permission is denied), the app clears the stored handle and shows the Connect button; no crash or stuck “connected” state.
- [ ] **Kanban (optional in this ticket):** If scope includes Kanban standalone: connecting the project folder or ticket-store root and then refreshing keeps that connection when permission is retained.
- [ ] No regression: connecting, disconnecting, and reconnecting still work; existing Supabase/config persistence (e.g. Kanban `SUPABASE_CONFIG_KEY`) is unchanged.

# Constraints
- Use only the File System Access API and IndexedDB (no new backend or server).
- Handle `queryPermission` / `requestPermission` correctly: if permission is revoked or denied after restore, clear the stored handle and fall back to “Connect project folder.”
- Browser support remains Chromium-only (File System Access API); no change to support matrix.
- Keep scope contained: HAL project-folder persistence is in scope; Kanban folder/ticket-store persistence may be same ticket or follow-up.

# Non-goals
- Persisting multiple folder handles or a “recent folders” list (single “last used” project folder is enough).
- Changing how Supabase credentials are sent or stored (Kanban localStorage for Supabase config stays as-is).
- Supporting non-Chromium browsers for this feature.

# Implementation notes
- **Store handle in IndexedDB** when the user successfully connects a project folder (HAL: `src/App.tsx` after `handleConnectProjectFolder`; Kanban: after folder pick in `projects/kanban/src/App.tsx` if in scope).
- **On app init:** Try to load the handle from IndexedDB; call `handle.queryPermission({ mode: 'read' })`; if `'granted'`, use the handle (re-read `.env`, set state, postMessage to Kanban for HAL). If `'prompt'`, call `handle.requestPermission({ mode: 'read' })`; on grant proceed, on deny clear stored handle.
- **Optional:** Use a stable `id` in `showDirectoryPicker({ id: 'hal-project-folder', mode: 'read' })` so the browser can associate persistent permission with that id (Chrome 122+).
- Small IndexedDB helper (get/set directory handle) is sufficient; no new dependencies required if using native `idb` or a few lines of IDB wrapper.
- HAL: after restore, re-run the same logic as “Connect project folder” (read `.env`, parse Supabase URL/key, postMessage to Kanban iframe, set `connectedProject` and conversation load).

# Audit artifacts
Create `docs/audit/0025-persist-project-folder-connection-across-rebuild/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md`
- `pm-review.md` (use `docs/templates/pm-review.template.md`)
