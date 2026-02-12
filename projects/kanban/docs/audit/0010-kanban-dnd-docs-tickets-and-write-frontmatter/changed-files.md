# Changed files (0010-kanban-dnd-docs-tickets-and-write-frontmatter)

## Modified

| Path | Change |
|------|--------|
| `src/vite-env.d.ts` | Extended File System Access API: FileSystemFileHandle createWritable(), requestPermission(); FileSystemWritableFileStream; getFileHandle(name, { create }). |
| `src/App.tsx` | Import frontmatter helpers and useDraggable. Added EMPTY_KANBAN_COLUMNS, KANBAN_COLUMN_IDS. DraggableTicketItem (useDraggable, path as id). State: ticketColumns, ticketCards, lastSavedTicketPath, lastSavedAt, lastWriteError. columnsForDisplay/cardsForDisplay. refreshTicketStore: read each ticket file, parse frontmatter, build ticketCards and column cardIds (col-todo/col-doing/col-done), set ticketColumns/ticketCards. handleConnectProject: showDirectoryPicker({ mode: 'readwrite' }). writeTicketKanbanFrontmatter(root, path, updates). handleDragEnd: drag-from-list (add ticket to column, persist, revert on fail); card move/reorder with persist when connected (setTicketColumns/setColumns, then write frontmatter). handleRemoveColumn uses setTicketColumns when connected. DndContext wraps columns + tickets sections; DragOverlay after tickets. SortableColumn hideRemove when connected. Add column/Remove hidden when connected. Tickets list: DraggableTicketItem; Saved/error UI. Debug: Ticket Store (last write error, last saved); Selected ticket frontmatter (kanbanColumnId, kanbanPosition, kanbanMovedAt). |
| `src/index.css` | Added .tickets-saved (green status). |

## Created

| Path | Purpose |
|------|---------|
| `src/frontmatter.ts` | Parse/merge/serialize YAML frontmatter for kanban keys (kanbanColumnId, kanbanPosition, kanbanMovedAt). |
| `docs/audit/0010-kanban-dnd-docs-tickets-and-write-frontmatter/plan.md` | Implementation plan |
| `docs/audit/0010-kanban-dnd-docs-tickets-and-write-frontmatter/worklog.md` | Work log |
| `docs/audit/0010-kanban-dnd-docs-tickets-and-write-frontmatter/changed-files.md` | This file |
| `docs/audit/0010-kanban-dnd-docs-tickets-and-write-frontmatter/decisions.md` | Design/tech decisions |
| `docs/audit/0010-kanban-dnd-docs-tickets-and-write-frontmatter/verification.md` | UI-only verification steps |

## Unchanged
- index.html, src/main.tsx, package.json, vite.config.ts, tsconfig.*.
