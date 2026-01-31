# Changed files: 0012 - PM agent: ticket ready check + move to To Do

## Modified

- `projects/hal-agents/src/agents/projectManager.ts`
  - sectionContent(), evaluateTicketReady(), ReadyCheckResult export; PLACEHOLDER_RE.
  - buildContextPack: "Ready-to-start checklist" section from docs/process/ready-to-start-checklist.md.
  - PM_SYSTEM_INSTRUCTIONS: move-to-To Do flow (fetch → evaluate → refuse or move → confirm).
  - fetch_ticket_content tool (when hasSupabase): by ticket_id, Supabase first then repo docs/tickets.
  - evaluate_ticket_ready tool: body_md → evaluateTicketReady().
  - kanban_move_ticket_to_todo tool (when hasSupabase): only if in Unassigned; update to col-todo.
  - tools: fetch_ticket_content, evaluate_ticket_ready, kanban_move_ticket_to_todo.
  - Fallback reply when kanban_move_ticket_to_todo succeeded but no model text.

## Created

- `docs/process/ready-to-start-checklist.md` — Definition of Ready (five checklist items).
- `docs/audit/0012-pm-agent-ticket-ready-check-and-move-to-todo/plan.md`
- `docs/audit/0012-pm-agent-ticket-ready-check-and-move-to-todo/worklog.md`
- `docs/audit/0012-pm-agent-ticket-ready-check-and-move-to-todo/changed-files.md`
- `docs/audit/0012-pm-agent-ticket-ready-check-and-move-to-todo/decisions.md`
- `docs/audit/0012-pm-agent-ticket-ready-check-and-move-to-todo/verification.md`
- `docs/audit/0012-pm-agent-ticket-ready-check-and-move-to-todo/pm-review.md`
