# Plan: 0038 - Enable PM/agent to edit ticket body in Supabase

## Goal

Allow a Cursor implementation agent to update ticket 0037 directly in the Supabase/kanban database so the PM "Unassigned check" (Definition of Ready) stops failing for 0037.

## Analysis

### Current State

- PM agent has create_ticket, fetch_ticket_content, evaluate_ticket_ready, kanban_move_ticket_to_todo.
- There is no tool to update a ticket's body_md in Supabase.
- Ticket 0037 in Unassigned fails Definition of Ready (missing/placeholder sections).
- The fix must be performed by writing to the database record, not by editing docs/tickets/0037-*.md.

### Approach

1. **update_ticket_body tool** (projectManager.ts): When hasSupabase, add a tool that updates tickets.body_md in Supabase for a given ticket_id. Accepts body_md (full markdown). Returns success/error and optional readiness check result.

2. **Script for one-time 0037 fix** (scripts/update-ticket-body-in-supabase.js): Read docs/tickets/0037-*.md, normalize section headings to ## (evaluateTicketReady expects ## for Goal, Human-verifiable deliverable, etc.), update Supabase. Run via `npm run update-ticket-body 0037`.

3. **Document formatting requirements**: Add JSDoc to evaluateTicketReady with exact section titles. Add normalizeBodyForReady in the script to convert # to ## for required sections.

4. **Audit artifacts**: plan, worklog, changed-files, decisions, verification, pm-review.

## Implementation Steps

1. Add update_ticket_body tool to projectManager.ts (when hasSupabase).
2. Update PM system instructions to describe when to use update_ticket_body.
3. Add fallback reply when update_ticket_body succeeds (model returns no text).
4. Add JSDoc to evaluateTicketReady for section structure.
5. Create scripts/update-ticket-body-in-supabase.js with normalizeBodyForReady.
6. Add npm script "update-ticket-body".
7. Create audit folder and artifacts.
