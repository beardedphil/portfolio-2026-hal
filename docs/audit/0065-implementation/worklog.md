# Worklog: Supabase-only ticket storage (0065)

## 2026-02-01

- Removed all file system mode state variables from App.tsx (`ticketStoreConnected`, `ticketStoreRootHandle`, `ticketStoreFiles`, `ticketColumns`, `ticketCards`, etc.)
- Removed file system connection handlers (`_handleConnectProject`, `refreshTicketStore`, `_handleSelectTicket`, `_handleRefreshTickets`)
- Updated `columnsForDisplay` and `cardsForDisplay` to only use Supabase (removed ticketStore fallbacks)
- Updated detail modal to only fetch from Supabase (removed docs/tickets fallback, shows error if not connected)
- Removed file system mode from drag-and-drop handlers (`handleDragEnd`)
- Removed file system sync functions (`_handlePreviewSync`, `_handleRunSync`, `writeDocTicketFile`, `writeTicketKanbanFrontmatter`)
- Updated `handleCreateColumn` and `handleRemoveColumn` to remove file system mode
- Updated debug panel: removed "Ticket Store" section, updated "Ticket Store (Supabase)" to show "Supabase-only" mode indicator
- Updated vite.config.ts: removed docs/tickets fallbacks in implementation and QA agent ticket fetching
- Updated projectManager.ts: removed docs/tickets fallback from `fetch_ticket_content` tool
- Updated sync-tickets.js: removed DB→Docs writes, made docs/tickets check optional (migration-only mode)
- Updated error messages to indicate Supabase-only mode requirements
