# Plan: 0012 - PM agent: ticket ready check + move to To Do

## Goal

Formalize a "ready-to-start" (Definition of Ready) checklist for moving a ticket into **To Do**, and enable the PM agent to run that gate and move **any** ticket from Unassigned into To Do when it passes.

## Analysis

### Current State

- PM agent has create_ticket (when Supabase set), list_directory, read_file, search_files.
- No tool to fetch ticket content by id; no tool to evaluate readiness; no tool to move a ticket to To Do.
- Kanban columns: col-unassigned, col-todo, col-doing, col-done (Supabase tickets.kanban_column_id).

### Approach

1. **Document Ready-to-start checklist** in `docs/process/ready-to-start-checklist.md`: Goal present, Human-verifiable deliverable present, Acceptance criteria checkboxes present, Constraints + Non-goals present, no obvious placeholders. Reference from PM context pack.
2. **fetch_ticket_content(ticket_id)** (when Supabase set): Try Supabase first (select id, title, body_md, kanban_column_id where id = normalized id); if not found, list docs/tickets and read matching NNNN-*.md from repo. Return body_md for evaluation.
3. **evaluate_ticket_ready(body_md)** (always): Pure function in code; tool returns ready, missingItems, checklistResults. PM uses result to decide whether to move; diagnostics show pass/fail + reasons.
4. **kanban_move_ticket_to_todo(ticket_id)** (when Supabase set): Verify ticket is in Unassigned (or null); update kanban_column_id to col-todo, set kanban_position (e.g. max+1 in col-todo), kanban_moved_at = now. Return ticketId, fromColumn, toColumn.
5. **PM system instructions**: When user asks to move a ticket to To Do, (1) fetch_ticket_content, (2) evaluate_ticket_ready, (3) if not ready reply with missing items; if ready call kanban_move_ticket_to_todo and confirm.
6. **Context pack**: Include docs/process/ready-to-start-checklist.md so PM has exact checklist text.
7. **Fallback reply**: If model returns no text but kanban_move_ticket_to_todo succeeded, provide a short confirmation (like create_ticket fallback).

## Implementation Steps

1. Create docs/process/ready-to-start-checklist.md with the five checklist items.
2. In projectManager.ts: add sectionContent(), evaluateTicketReady() (export ReadyCheckResult); add ready-to-start section to buildContextPack.
3. Add fetch_ticket_content tool (when hasSupabase): Supabase first, then repo docs/tickets.
4. Add evaluate_ticket_ready tool (body_md → ready, missingItems, checklistResults).
5. Add kanban_move_ticket_to_todo tool (when hasSupabase): check column, update to col-todo.
6. Update PM_SYSTEM_INSTRUCTIONS with move-to-To Do flow and reference to checklist.
7. Add fallback reply when kanban_move_ticket_to_todo succeeded but no model text.
8. Create audit artifacts: plan, worklog, changed-files, decisions, verification, pm-review.
