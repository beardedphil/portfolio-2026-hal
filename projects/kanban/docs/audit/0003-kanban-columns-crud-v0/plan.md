# Plan (0003-kanban-columns-crud-v0)

## Goal
Let a human add and remove kanban columns in the UI. No tickets/cards, no persistence, no drag-and-drop.

## Steps

1. **State and types**
   - Add `Column` type: `{ id: string; title: string }`.
   - Add state: `columns` (array), `showAddColumnForm` (boolean), `newColumnTitle` (string).
   - Use stable unique ids (e.g. `crypto.randomUUID()` with fallback).

2. **Columns section**
   - Add a **Columns** section with heading and **Add column** button.
   - Clicking **Add column** shows a small form: text input + Create / Cancel.
   - On Create: trim title, create column with new id, push to `columns`, clear form and hide it; optionally log to Action Log.
   - On Cancel: clear input and hide form.

3. **Column cards**
   - Render `columns` as a horizontal row of cards. Each card shows column title and a **Remove** button.
   - Remove: filter out column by id; optionally log removal to Action Log.

4. **Debug panel — Kanban state**
   - Add a **Kanban state** section: **Column count: N** and **Column names: A, B, C** (or “(none)”). Readable in-app so verification needs no external tools.

5. **Styling**
   - Add minimal CSS in `index.css` for `.columns-section`, `.add-column-form`, `.column-card`, `.column-remove` so layout is readable.

6. **Audit artifacts**
   - Create `docs/audit/0003-kanban-columns-crud-v0/` with `plan.md`, `worklog.md`, `changed-files.md`, `decisions.md`, `verification.md`.

## Out of scope
- Tickets/cards, drag-and-drop, persistence, styling polish beyond readable layout.
