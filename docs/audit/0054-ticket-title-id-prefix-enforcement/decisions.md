# Decisions

## ID Prefix Format

- **Format**: `<ID> — <title>` (using em dash —, not hyphen -)
- **Example**: `0048 — Draggable resizer between Chat and Kanban regions`
- **Rationale**: Consistent with ticket 0048 example in requirements; em dash is visually distinct from hyphens used in filenames

## Normalization Strategy

- **Automatic enforcement**: Title line is normalized in all paths:
  - When creating tickets (PM agent create_ticket tool)
  - When updating tickets (PM agent update_ticket_body tool)
  - When syncing DB ↔ docs (sync-tickets.js)
  - When fetching tickets in UI (refetchSupabaseTickets)
  - When opening ticket detail modal

- **Diagnostics**: When normalization occurs, a message is logged: "Ticket <ID>: Title normalized to include ID prefix"
- **Rationale**: Ensures ID prefix is always present and users are informed when normalization happens

## Title Extraction for Display

- **Strip ID prefix**: When extracting title for display (e.g. in card titles), the ID prefix is stripped
- **Rationale**: Card titles should show just the title, not the ID prefix (ID is shown separately)

## No Breaking Changes

- Existing tickets without ID prefix are automatically normalized on first read/display
- No manual migration needed; normalization happens automatically
