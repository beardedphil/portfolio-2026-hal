# Plan (0009-docs-ticketstore-readonly-viewer)

## Goal
Make tickets visible in-app by connecting to a project folder and reading `docs/tickets/*.md` (read-only). No editing, no kanban sync, no git.

## Deliverable (UI-only)
- **Tickets (Docs)** panel with connection status (Disconnected / Connected).
- When Disconnected: "Connect project" button + short explanation; cancel picker → "Connect cancelled."
- When Connected: ticket file count, scrollable list of filenames; click → Ticket Viewer (path + full contents).
- If folder has no `docs/tickets/`: Connected-but-empty with "No `docs/tickets` folder found." and "Found 0 tickets."
- Debug panel: **Ticket Store** section (Store, Connected, Last refresh, Last error).

## Steps

1. **Types**
   - Add minimal File System Access API types in `vite-env.d.ts` (FileSystemDirectoryHandle, FileSystemFileHandle, window.showDirectoryPicker).

2. **State (App.tsx)**
   - `ticketStoreConnected`, `ticketStoreRootHandle`, `ticketStoreFiles`, `ticketStoreLastRefresh`, `ticketStoreLastError`, `ticketStoreConnectMessage`, `selectedTicketPath`, `selectedTicketContent`, `ticketViewerLoading`.

3. **Connect and refresh**
   - `refreshTicketStore(root)`: get `docs` then `tickets`; list `*.md`; set files (sorted by name), lastRefresh, or on error set lastError and empty files.
   - `handleConnectProject`: call `window.showDirectoryPicker()`. On AbortError set connectMessage "Connect cancelled." and return. Else set connected + rootHandle, then `refreshTicketStore(root)`.
   - Optional **Refresh** button when connected: call `refreshTicketStore(ticketStoreRootHandle)`.

4. **Select ticket**
   - `handleSelectTicket(path, name)`: from root get `docs/tickets`, then `getFileHandle(name)`, getFile(), text(). Set selectedTicketPath, selectedTicketContent (or error message).

5. **UI**
   - Section "Tickets (Docs)" with status (Connected/Disconnected).
   - Disconnected: explanation + "Connect project" button; show connectMessage if set (e.g. "Connect cancelled.").
   - Connected: show lastError if any; "Found N tickets."; Refresh button; two-column layout: scrollable list of ticket filenames (buttons) + Ticket Viewer (path + pre with contents, or placeholder/loading).

6. **Debug panel**
   - New section "Ticket Store" with: Store: Docs (read-only), Connected: true/false, Last refresh: ISO or "never", Last error: message or "none".

7. **CSS (index.css)**
   - Styles for `.tickets-docs-section`, status, explanation, connect/refresh buttons, tickets list, ticket-file-btn, ticket-viewer, ticket-viewer-content.

8. **Audit**
   - Create `docs/audit/0009-docs-ticketstore-readonly-viewer/` with plan, worklog, changed-files, decisions, verification.

## Out of scope
- No create/edit/delete tickets.
- No syncing tickets to kanban.
- No git operations from UI.
