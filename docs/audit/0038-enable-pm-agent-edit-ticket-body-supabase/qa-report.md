# QA Report: 0038 - Enable PM/agent to edit ticket body in Supabase

## 1. Ticket & deliverable

- **Goal:** Allow a Cursor implementation agent to update ticket 0037 directly in the Supabase/kanban database so the PM "Unassigned check" (Definition of Ready) stops failing for 0037.
- **Deliverable:** A human can open the embedded Kanban UI, view ticket 0037, and see that its ticket details include non-empty Goal, Human-verifiable deliverable, Acceptance criteria (with checkboxes), Constraints, and Non-goals; the PM "Unassigned check" no longer reports those sections as missing for 0037.
- **Acceptance criteria:** (1) Ticket 0037 shows full correctly formatted body in Kanban UI. (2) PM Unassigned check no longer flags 0037 for missing sections. (3) No unresolved template placeholders in body. (4) Formatting/parsing requirement documented in-code. (5) Kanban UI reflects updated content within ~10 seconds without manual refresh.

## 2. Audit artifacts

All required artifacts are present in `docs/audit/0038-enable-pm-agent-edit-ticket-body-supabase/`:

- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md`
- `pm-review.md`

## 3. Code review — PASS

Implementation matches the ticket and plan.

| Requirement | Implementation |
|-------------|----------------|
| Script to update ticket body in Supabase | `scripts/update-ticket-body-in-supabase.js` reads from docs/tickets, normalizes ## headings, updates DB; npm script "update-ticket-body" in package.json. |
| PM agent update_ticket_body tool | projectManager.ts: update_ticket_body tool when hasSupabase; accepts ticket_id, body_md; updates tickets.body_md; returns success/ready/missingItems. |
| PM system instructions for editing ticket body | projectManager.ts line 294: "Editing ticket body in Supabase" instruction; fallback reply when update_ticket_body succeeds (lines 906–917). |
| Update via DB, not docs/tickets | Script reads doc as source but writes to Supabase; update_ticket_body writes directly to DB. |
| Formatting requirement documented in-code | projectManager.ts lines 60–72: JSDoc on evaluateTicketReady with exact section titles; update-ticket-body-in-supabase.js lines 28–46: REQUIRED_SECTIONS, normalizeBodyForReady with comment "evaluateTicketReady expects exactly ## Section Title". |
| No placeholders in 0037 body | Ticket 0037 in docs/tickets has all required sections (Goal, deliverable, AC with - [ ] checkboxes, Constraints, Non-goals) and no `<AC 1>`, `<task-id>`, etc. |

Constraints satisfied: update performed by writing to DB; changes auditable; verification possible via in-app UI (no console/devtools).

## 4. UI verification

**Script verification (automated):** Ran from project root with .env configured:

```
npm run sync-tickets
npm run update-ticket-body -- 0037
```

Both completed successfully. Output: "Updated ticket 0037 body_md in Supabase from docs/tickets/0037-remove-add-column-and-debug-toggle-ui-prescriptive-mode.md. Kanban UI will reflect the change within ~10 seconds (poll interval)."

**Manual UI steps (Connect Project Folder required):** The embedded Kanban UI requires the user to click "Connect Project Folder" (native folder picker) to supply Supabase credentials. Automated browser verification cannot complete this step. Manual steps from `verification.md`:

1. Connect Project Folder (select project with .env containing VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY).
2. In Kanban, locate ticket 0037 and click it.
3. Confirm the detail modal shows full body with Goal, Human-verifiable deliverable, Acceptance criteria (checkboxes), Constraints, Non-goals.
4. Confirm PM Unassigned check (on load or after sync) does not flag 0037 for missing sections.
5. After running update-ticket-body 0037, wait up to ~10 seconds; Kanban UI should reflect updated content without manual refresh.

## 5. Verdict

- **Implementation:** Complete and matches the ticket, plan, and constraints.
- **Merge:** OK to merge. Script verification passed. Manual UI verification (Connect Project Folder → view 0037 → confirm PM check) should be run by the user when testing in Human in the Loop.
