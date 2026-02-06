# Verification: Agent-artifacts system (0082)

## UI-only verification steps

### Test Case 1: Artifacts section appears in ticket detail modal

1. **Setup**: Connect project folder with Supabase credentials
2. **Action**: Click on any ticket card in the Kanban board to open ticket detail modal
3. **Verify**:
   - Ticket detail modal opens showing ticket title, ID, priority, and body content
   - Below the ticket body, an "Artifacts" section is visible
   - If no artifacts exist, section shows: "No artifacts available for this ticket."

### Test Case 2: Implementation artifact appears after agent completes

1. **Setup**: Connect project folder with Supabase credentials, ensure Supabase migration 0082 has been run
2. **Action**: 
   - In Implementation Agent chat, type "Implement ticket 0082" (or any ticket)
   - Wait for agent to complete (status shows "Completed")
3. **Verify**:
   - Open ticket detail modal for the ticket that was implemented
   - In Artifacts section, see "Implementation report" listed
   - Click on "Implementation report" item
   - Artifact report viewer opens showing:
     - Report title: "Implementation report for ticket XXXX"
     - Agent type: "Implementation report"
     - Created timestamp
     - Report body (summary, PR URL if available, worklog if available)
   - Close artifact viewer (X button, Escape key, or backdrop click)

### Test Case 3: QA artifact appears after QA completes

1. **Setup**: Connect project folder with Supabase credentials, ensure ticket has qa-report.md in audit folder
2. **Action**:
   - In QA Agent chat, type "QA ticket 0082" (or any ticket)
   - Wait for agent to complete (status shows "Completed")
3. **Verify**:
   - Open ticket detail modal for the ticket that was QA'd
   - In Artifacts section, see "QA report" listed
   - Click on "QA report" item
   - Artifact report viewer opens showing:
     - Report title: "QA report for ticket XXXX"
     - Agent type: "QA report"
     - Created timestamp
     - Report body (content from qa-report.md)
   - Close artifact viewer

### Test Case 4: Multiple agent types appear

1. **Setup**: Connect project folder, ensure ticket has both Implementation and QA artifacts
2. **Action**: Open ticket detail modal for a ticket with multiple artifacts
3. **Verify**:
   - Artifacts section shows both "Implementation report" and "QA report" (or other agent types)
   - Each artifact shows its creation timestamp
   - Clicking each artifact opens its respective report viewer

### Test Case 5: Artifacts persist after page refresh

1. **Setup**: Connect project folder, ensure ticket has artifacts
2. **Action**: 
   - Open ticket detail modal and verify artifacts are visible
   - Refresh the page
   - Reopen ticket detail modal
3. **Verify**:
   - Artifacts section still shows the same artifacts
   - Artifacts are loaded from Supabase (not just in-memory state)

### Test Case 6: Empty state when no artifacts

1. **Setup**: Connect project folder
2. **Action**: Open ticket detail modal for a ticket with no artifacts
3. **Verify**:
   - Artifacts section is visible
   - Section shows: "No artifacts available for this ticket."
   - Section is not hidden or collapsed

## Verification notes

- All verification is **UI-only** - no terminal, devtools, or console required
- Artifacts are stored in Supabase, so they persist across sessions
- Artifact insertion happens automatically when agents complete work
- If Supabase migration 0082 has not been run, artifacts will not appear (database table missing)
