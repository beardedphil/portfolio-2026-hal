# Verification: 0038 - Enable PM/agent to edit ticket body in Supabase

## UI-only verification

1. **Run one-time 0037 fix** (project root, .env configured):
   ```
   npm run sync-tickets
   npm run update-ticket-body 0037
   ```

2. **Open embedded Kanban UI** (Connect Project Folder, or HAL with Supabase connected).

3. **View ticket 0037** — Click the ticket card; the detail modal shows full body with Goal, Human-verifiable deliverable, Acceptance criteria (checkboxes), Constraints, Non-goals. No placeholders like `<AC 1>`.

4. **PM Unassigned check** — Run check-unassigned (e.g. sync-tickets triggers it, or load app). Ticket 0037 should no longer appear in notReady. It either moves to To Do (if ready) or the check does not flag it for missing sections.

5. **Poll interval** — After the script runs, wait up to ~10 seconds; the Kanban UI should reflect the updated content without manual refresh.

## PM agent tool verification

1. In HAL chat with project connected, ask: "Update ticket 0037 body so it passes Definition of Ready."
2. PM should call update_ticket_body with full body_md.
3. Kanban UI reflects the change within ~10 seconds.
