# Decisions (0003-kanban-columns-crud-v0)

## Column shape and ids
- **Decision:** Column type `{ id: string; title: string }`; ids from `crypto.randomUUID()` with fallback for environments that don’t support it.
- **Reason:** Ticket suggestion; stable ids avoid key collisions and allow safe remove by id.

## In-memory state only
- **Decision:** No persistence; columns live in React state only.
- **Reason:** Ticket non-goal: "No persistence yet (unless required to keep UI verification sane)." In-app verification is possible via Debug panel summary.

## Kanban state in Debug panel
- **Decision:** Debug panel shows "Column count: N" and "Column names: A, B, C" (or "(none)").
- **Reason:** Ticket requires verification with no external tools; readable summary lets a human confirm count and names without counting manually.

## Action Log for add/remove
- **Decision:** Log "Column added: …" and "Column removed: …" to Action Log when columns change.
- **Reason:** In-app traceability; failures are explainable from within the app.

## Minimal styling
- **Decision:** Readable layout only: horizontal row of cards, simple form, no visual polish.
- **Reason:** Ticket: "No styling polish beyond readable layout."
