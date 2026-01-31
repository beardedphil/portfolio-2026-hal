# Worklog: 0038 - Enable PM/agent to edit ticket body in Supabase

## Summary

- **projectManager.ts**: Added update_ticket_body tool (when hasSupabase). Accepts ticket_id and body_md; updates Supabase tickets.body_md; returns success/ready/missingItems. Added JSDoc to evaluateTicketReady documenting exact section titles (Goal (one sentence), Human-verifiable deliverable (UI-only), Acceptance criteria (UI-only), Constraints, Non-goals). Updated PM system instructions for "Editing ticket body in Supabase". Added fallback reply when update_ticket_body succeeds.
- **scripts/update-ticket-body-in-supabase.js**: New script. Reads docs/tickets/<id>-*.md, normalizes # to ## for required sections (normalizeBodyForReady), updates Supabase, writes normalized body back to doc so future sync-tickets does not overwrite. Usage: node scripts/update-ticket-body-in-supabase.js [ticketId] (default 0037).
- **package.json**: Added "update-ticket-body" npm script.
- **Audit**: Created docs/audit/0038-enable-pm-agent-edit-ticket-body-supabase/ (plan, worklog, changed-files, decisions, verification, pm-review).

## One-time 0037 fix

Run from project root with .env configured:
```
npm run sync-tickets    # ensure 0037 exists in Supabase
npm run update-ticket-body 0037
```
Kanban UI reflects the update within ~10 seconds (poll interval).
