# Changed files: 0038 - Enable PM/agent to edit ticket body in Supabase

## New

- `scripts/update-ticket-body-in-supabase.js` — Script to update ticket body_md in Supabase; reads from docs/tickets, normalizes ## headings, updates DB
- `docs/audit/0038-enable-pm-agent-edit-ticket-body-supabase/plan.md`
- `docs/audit/0038-enable-pm-agent-edit-ticket-body-supabase/worklog.md`
- `docs/audit/0038-enable-pm-agent-edit-ticket-body-supabase/changed-files.md`
- `docs/audit/0038-enable-pm-agent-edit-ticket-body-supabase/decisions.md`
- `docs/audit/0038-enable-pm-agent-edit-ticket-body-supabase/verification.md`
- `docs/audit/0038-enable-pm-agent-edit-ticket-body-supabase/pm-review.md`

## Modified

- `projects/hal-agents/src/agents/projectManager.ts` — Added update_ticket_body tool; JSDoc on evaluateTicketReady; PM system instructions for editing ticket body; fallback reply for update_ticket_body success
- `package.json` — Added "update-ticket-body" script
- `docs/tickets/0037-remove-add-column-and-debug-toggle-ui-prescriptive-mode.md` — Normalized # to ## for required sections (script write-back for doc/DB sync)
