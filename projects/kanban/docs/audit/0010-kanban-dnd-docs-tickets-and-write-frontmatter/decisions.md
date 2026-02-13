# Decisions (0010-kanban-dnd-docs-tickets-and-write-frontmatter)

## Connect with readwrite from the start
- **Decision:** Use `showDirectoryPicker({ mode: 'readwrite' })` when connecting so the app can write frontmatter without a second "enable writing" step.
- **Rationale:** Ticket says "when the user chooses to enable writing"; treating "Connect project" as that choice keeps the flow minimal.

## Single DndContext for columns and tickets list
- **Decision:** Wrap both the Columns section and the Tickets (Docs) section in one DndContext so tickets can be dragged from the list and dropped on column droppables.
- **Rationale:** dnd-kit requires the drag source and drop target to be in the same context.

## Ticket id = file path
- **Decision:** Use ticket file path (e.g. `docs/tickets/0010-....md`) as the card id when tickets are in columns.
- **Rationale:** Uniquely identifies the file for frontmatter writes; no extra id mapping.

## Revert on write failure (cross-column / drop from list)
- **Decision:** On write failure after dropping a ticket into a column (or moving between columns), revert the column state and show in-app error. Do not leave the card in the new column.
- **Rationale:** Ticket: "the card does not silently appear in the new column (or it appears with a clear Unsaved state—pick one and document it)." We chose: do not show in new column.

## Fixed three columns when connected
- **Decision:** When ticket store is connected, show only To-do/Doing/Done (col-todo, col-doing, col-done); hide Add column and Remove so the three columns stay fixed.
- **Rationale:** Ticket deliverable: "existing Kanban columns (To-do/Doing/Done)"; minimal scope.

## Minimal frontmatter parser (no YAML lib)
- **Decision:** Implement a small parser in src/frontmatter.ts: split on ---, parse "key: value" lines, merge only our three keys, serialize back.
- **Rationale:** No new dependency; sufficient for kanbanColumnId, kanbanPosition, kanbanMovedAt; other keys preserved as opaque key-value pairs.

## DraggableTicketItem: listeners on li, click on button
- **Decision:** useDraggable listeners and attributes on the list item; button only for click (with stopPropagation) and aria-pressed for selection.
- **Rationale:** Avoids duplicate aria-pressed from dnd-kit attributes; drag on the row, click to view content.
