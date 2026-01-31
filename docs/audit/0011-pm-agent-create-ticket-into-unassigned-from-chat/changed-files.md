# Changed files: 0011 - PM agent: create ticket into Unassigned from chat

## Modified

- `projects/hal-agents/src/agents/projectManager.ts`
  - Import createClient from @supabase/supabase-js; add slugFromTitle().
  - PmAgentConfig: optional supabaseUrl, supabaseAnonKey.
  - PM_SYSTEM_INSTRUCTIONS: create_ticket usage and template/secrets guidance.
  - create_ticket tool (when Supabase set): next id from DB, insert row, return result.
- `vite.config.ts`
  - Import spawn; PmAgentResponse.ticketCreationResult.
  - Pass supabaseUrl/supabaseAnonKey to runPmAgent; run sync-tickets after create_ticket success; add ticketCreationResult to response.
- `src/App.tsx`
  - TicketCreationResult type; PmAgentResponse.ticketCreationResult; DiagnosticsInfo.lastTicketCreationResult.
  - State lastTicketCreationResult; set/clear; Diagnostics "Ticket creation" section.

## Created

- `docs/audit/0011-pm-agent-create-ticket-into-unassigned-from-chat/plan.md`
- `docs/audit/0011-pm-agent-create-ticket-into-unassigned-from-chat/worklog.md`
- `docs/audit/0011-pm-agent-create-ticket-into-unassigned-from-chat/changed-files.md`
- `docs/audit/0011-pm-agent-create-ticket-into-unassigned-from-chat/decisions.md`
- `docs/audit/0011-pm-agent-create-ticket-into-unassigned-from-chat/verification.md`
- `docs/audit/0011-pm-agent-create-ticket-into-unassigned-from-chat/pm-review.md`
