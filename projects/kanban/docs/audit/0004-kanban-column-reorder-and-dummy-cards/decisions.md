# Decisions (0004-kanban-column-reorder-and-dummy-cards)

## @dnd-kit for drag-and-drop
- **Decision:** Use `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` for column reordering.
- **Reason:** Ticket implementation notes: "Prefer a well-maintained drag-and-drop approach (e.g. @dnd-kit/*) rather than ad-hoc mouse handlers."

## Drag handle on column title only
- **Decision:** Apply `attributes` and `listeners` from `useSortable` to the column title span, not the whole card or Remove button.
- **Reason:** Keeps Remove button clickable without triggering drag; clear affordance (title = draggable).

## Activation constraint on PointerSensor
- **Decision:** `activationConstraint: { distance: 8 }` so a quick click (e.g. on Remove) doesn't start a drag.
- **Reason:** User must move pointer 8px to begin reorder; reduces accidental drags when clicking buttons.

## Static dummy cards
- **Decision:** Single `DUMMY_CARDS` constant with 3 items; same cards in every column.
- **Reason:** Ticket: "static data is fine"; minimal implementation for spacing/layout verification.

## Column order display format
- **Decision:** "Column order: A → B → C" with arrow (→) between names.
- **Reason:** Ticket example: "Column order: A → B → C"; readable without external tools.

## Reorder log format
- **Decision:** `Columns reordered: A,B,C -> B,A,C` (comma-separated, arrow separator).
- **Reason:** Ticket example; compact and machine-readable for verification.
