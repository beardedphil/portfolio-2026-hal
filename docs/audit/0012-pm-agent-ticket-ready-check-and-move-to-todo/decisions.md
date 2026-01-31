# Decisions: 0012 - PM agent: ticket ready check + move to To Do

## Ready-to-start checklist location

The checklist is in docs/process/ready-to-start-checklist.md and is injected into the PM context pack so the model sees the exact text. It is also referenced in PM system instructions. No separate .cursor/rules file was added; the checklist is process documentation.

## Fetch ticket: Supabase first, then repo

fetch_ticket_content tries Supabase first (single row by id). If no row (e.g. ticket only in docs, or different project), it falls back to listing docs/tickets and reading the file matching NNNN-*.md. This supports tickets created manually or synced from elsewhere.

## Readiness as a tool (evaluate_ticket_ready)

Readiness is implemented as a deterministic tool that parses body_md and returns ready, missingItems, and checklistResults. This gives diagnostics a clear pass/fail + reasons without relying on model prose. The PM is instructed to call it before kanban_move_ticket_to_todo.

## Move only from Unassigned

kanban_move_ticket_to_todo fails if the ticket's current kanban_column_id is not col-unassigned, null, or empty. This avoids "magic" moves from other columns and keeps the flow: Unassigned → (ready gate) → To Do.

## Position in To Do

When moving, the ticket is given kanban_position = max(positions in col-todo) + 1 so it appears at the end of To Do. kanban_moved_at is set to now for audit.
