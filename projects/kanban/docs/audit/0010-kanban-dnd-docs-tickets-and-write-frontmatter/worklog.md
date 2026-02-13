# Worklog (0010-kanban-dnd-docs-tickets-and-write-frontmatter)

## Summary
Implemented Kanban ↔ Docs tickets v1: drag tickets from the Tickets (Docs) list into To-do/Doing/Done; persist column, position, and moved timestamp into ticket files via YAML frontmatter. Connect uses readwrite; load places tickets by frontmatter; drag-from-list and move/reorder persist and show Saved or write error.

## Implementation order
1. Added `src/frontmatter.ts`: parse frontmatter, getKanbanFromFrontmatter, mergeKanbanFrontmatter, updateKanbanInContent, serializeDoc.
2. Extended `src/vite-env.d.ts`: FileSystemFileHandle createWritable, requestPermission; FileSystemWritableFileStream.
3. In App: state ticketColumns, ticketCards, lastSavedTicketPath, lastSavedAt, lastWriteError; columnsForDisplay/cardsForDisplay.
4. refreshTicketStore: list files, read each file, parse frontmatter, build ticketCards and column cardIds (col-todo/col-doing/col-done), set ticketColumns/ticketCards.
5. handleConnectProject: showDirectoryPicker({ mode: 'readwrite' }).
6. writeTicketKanbanFrontmatter(root, path, updates).
7. DndContext wrapped columns + tickets sections; DraggableTicketItem for list; handleDragEnd: drag-from-list and card move/reorder with persist (revert on write fail for drop/move).
8. Saved/error UI; Debug: Ticket Store (last write error, last saved), Selected ticket frontmatter. Hide Add/Remove column when connected.
9. CSS .tickets-saved. Audit folder and artifacts.

## Commit and status
- Committed and pushed with ticket ID in commit subject (e.g. `feat(0010): ...`).
- `git status -sb` (after push): `## main...origin/main`
