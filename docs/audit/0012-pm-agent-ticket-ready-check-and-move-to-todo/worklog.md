# Worklog: 0012 - PM agent: ticket ready check + move to To Do

## Summary

- Added docs/process/ready-to-start-checklist.md (Definition of Ready): Goal, Human-verifiable deliverable, Acceptance criteria checkboxes, Constraints + Non-goals, no placeholders.
- PM context pack now includes the ready-to-start checklist from that file.
- In hal-agents: sectionContent(), evaluateTicketReady() (export ReadyCheckResult); fetch_ticket_content tool (Supabase first, then repo docs/tickets); evaluate_ticket_ready tool (body_md → ready, missingItems, checklistResults); kanban_move_ticket_to_todo tool (only if ticket in Unassigned, update to col-todo).
- PM system instructions: when user asks to move a ticket to To Do, fetch → evaluate → if not ready refuse with missing items; if ready call kanban_move_ticket_to_todo and confirm.
- Fallback reply when model returns no text but kanban_move_ticket_to_todo succeeded.

## Changes

### docs/process/ready-to-start-checklist.md (new)

- Five checklist items; reference to ticket template and PM agent tools.

### projects/hal-agents/src/agents/projectManager.ts

- sectionContent(body, sectionTitle) for parsing ticket sections.
- PLACEHOLDER_RE and evaluateTicketReady(bodyMd): returns ready, missingItems, checklistResults (goal, deliverable, acceptanceCriteria, constraintsNonGoals, noPlaceholders).
- buildContextPack: new section "Ready-to-start checklist" from docs/process/ready-to-start-checklist.md.
- PM_SYSTEM_INSTRUCTIONS: "Moving a ticket to To Do" — fetch_ticket_content → evaluate_ticket_ready → refuse with missingItems or kanban_move_ticket_to_todo → confirm.
- fetch_ticket_content tool (when hasSupabase): ticket_id → normalized id; Supabase select; if no row, list docs/tickets, find NNNN-*.md, read_file; return id, title, body_md, kanban_column_id.
- evaluate_ticket_ready tool: body_md → evaluateTicketReady(); push truncated body_md in toolCalls for diagnostics.
- kanban_move_ticket_to_todo tool (when hasSupabase): fetch ticket; if not col-unassigned/null/empty, error; else update kanban_column_id to col-todo, kanban_position max+1, kanban_moved_at now; return ticketId, fromColumn, toColumn.
- tools object: spread fetch_ticket_content, evaluate_ticket_ready, kanban_move_ticket_to_todo when available.
- Fallback reply: if no text and kanban_move_ticket_to_todo success, reply with moved ticket id and column confirmation.
