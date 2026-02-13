# Plan (0010-kanban-dnd-docs-tickets-and-write-frontmatter)

## Goal
Let a human drag a docs-backed ticket into a kanban column and persist its column + position + moved timestamp into the ticket file via YAML frontmatter.

## Deliverable (UI-only)
- After connecting to a project folder (with readwrite), the UI shows both: existing Kanban columns (To-do/Doing/Done) and the Tickets (Docs) list.
- Dragging a ticket from the Tickets list into a column shows the ticket as a card in that column and shows an in-app "Saved" (or "Saved to file") confirmation.
- Dragging a ticket between columns or reordering within a column persists frontmatter; Debug panel shows updated kanbanColumnId, kanbanPosition, kanbanMovedAt.
- On refresh + reconnect, tickets appear in the column indicated by their frontmatter, ordered by kanbanPosition.
- If write fails: in-app error, card does not stay in the new column (revert), Debug records last write error.

## File format
- YAML frontmatter: `kanbanColumnId`, `kanbanPosition` (0-based), `kanbanMovedAt` (UTC ISO-8601).
- Merge/update these keys without destroying other frontmatter keys; add frontmatter if missing.

## Steps

1. **Frontmatter utility (src/frontmatter.ts)**
   - Parse frontmatter from markdown (split on ---, parse key: value lines).
   - getKanbanFromFrontmatter(fm), mergeKanbanFrontmatter(existing, updates), updateKanbanInContent(content, updates), serializeDoc.

2. **File System Access API write support (vite-env.d.ts)**
   - Extend FileSystemFileHandle with createWritable(), requestPermission(); add FileSystemWritableFileStream.

3. **Connect with readwrite**
   - handleConnectProject: call showDirectoryPicker({ mode: 'readwrite' }) so writes are possible after connect.

4. **Load tickets and place by frontmatter**
   - refreshTicketStore: after listing docs/tickets/*.md, for each file read content, parse frontmatter; build ticketCards (path -> { id, title }); build column cardIds from kanbanColumnId/kanbanPosition (col-todo, col-doing, col-done). Set ticketColumns, ticketCards.

5. **Derived columns/cards when connected**
   - columnsForDisplay = ticketStoreConnected ? ticketColumns : columns; cardsForDisplay = ticketStoreConnected ? ticketCards : cards. Use everywhere for display and DnD.

6. **Write helper**
   - writeTicketKanbanFrontmatter(root, path, updates): get file by path, read content, updateKanbanInContent, requestPermission('readwrite'), createWritable(), write, close. Used after drop/move/reorder.

7. **DndContext wrap columns + tickets**
   - Move DndContext to wrap both Columns section and Tickets (Docs) section so tickets can be dropped on columns.

8. **Draggable ticket list**
   - DraggableTicketItem: useDraggable({ id: path }); listeners on li, button for click-to-select. Tickets list uses DraggableTicketItem.

9. **handleDragEnd: drag from list**
   - If !sourceColumn && ticketStoreConnected && overColumn && active.id in ticketStoreFiles: add ticket to overColumn at overIndex, setTicketColumns, then writeTicketKanbanFrontmatter. On success set lastSavedTicketPath, lastSavedAt; on failure revert and set lastWriteError.

10. **handleDragEnd: card move/reorder + persist**
    - When ticketStoreConnected, use setTicketColumns/setTicketColumns for state. After same-column reorder: write all ticket paths in that column with new kanbanPosition (movedAt only for dragged card). After cross-column move: write moved ticket with new column, position, movedAt. On cross-column write failure revert and set lastWriteError.

11. **Saved and error UI**
    - Show "Saved to file: {path}" when lastSavedTicketPath set; clear after 3s (useEffect). Show lastWriteError in Tickets section. Debug: Last write error, Last saved; Selected ticket frontmatter (path, kanbanColumnId, kanbanPosition, kanbanMovedAt).

12. **When connected: fixed three columns**
    - Hide Add column / Remove column when ticketStoreConnected so To-do/Doing/Done stay fixed.

13. **Audit**
    - Create docs/audit/0010-kanban-dnd-docs-tickets-and-write-frontmatter/ with plan, worklog, changed-files, decisions, verification.

## Out of scope
- No editing ticket body from UI.
- No git commits from UI.
- No cross-repo multi-project.
