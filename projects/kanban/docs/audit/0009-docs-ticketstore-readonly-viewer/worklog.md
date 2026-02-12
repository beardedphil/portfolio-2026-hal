# Worklog (0009-docs-ticketstore-readonly-viewer)

## 1. Types
- Added minimal File System Access API declarations in `src/vite-env.d.ts`: `FileSystemDirectoryHandle` (kind, getDirectoryHandle, getFileHandle, entries), `FileSystemFileHandle` (kind, getFile), `Window.showDirectoryPicker`.

## 2. State and handlers (App.tsx)
- Introduced type `TicketFile = { name: string; path: string }`.
- Added state: ticketStoreConnected, ticketStoreRootHandle, ticketStoreFiles, ticketStoreLastRefresh, ticketStoreLastError, ticketStoreConnectMessage, selectedTicketPath, selectedTicketContent, ticketViewerLoading.
- `refreshTicketStore(root)`: gets docs then tickets; iterates entries for `*.md`; sets files (sorted), lastRefresh; on error sets lastError and empty files.
- `handleConnectProject`: checks showDirectoryPicker; on success sets connected + rootHandle and calls refreshTicketStore; on AbortError sets connectMessage "Connect cancelled." and returns.
- `handleSelectTicket(path, name)`: from root gets docs/tickets, getFileHandle(name), getFile(), text(); sets selected path and content (or error string).
- `handleRefreshTickets`: calls refreshTicketStore(rootHandle) when connected.

## 3. Tickets (Docs) UI
- New section "Tickets (Docs)" with status (Connected/Disconnected).
- Disconnected: explanation with `docs/tickets/*.md`, Connect project button, connectMessage when set (e.g. "Connect cancelled.").
- Connected: lastError if any; "Found N tickets."; Refresh button; layout: scrollable list of ticket file buttons + Ticket Viewer (path, loading state, pre with content or placeholder).

## 4. Debug panel
- New "Ticket Store" section: Store: Docs (read-only), Connected: true/false, Last refresh: ISO or "never", Last error: message or "none".

## 5. CSS
- Styles in index.css for tickets-docs-section, status, explanation, connect/refresh buttons, tickets list, ticket-file-btn, ticket-viewer and content/placeholder/loading.

## 6. Audit artifacts
- Created docs/audit/0009-docs-ticketstore-readonly-viewer/ with plan.md, worklog.md, changed-files.md, decisions.md, verification.md.

## Commit and push
- Commit: `dac7e07`
- `git status -sb` (after push): `## main...origin/main`
