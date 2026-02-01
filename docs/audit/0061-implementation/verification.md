# Verification: Auto-move tickets on agent completion (0061)

## UI-only verification steps

### Test Case 1: Implementation Agent completion → QA

1. **Setup**: Connect project folder with Supabase credentials
2. **Action**: In Implementation Agent chat, type "Implement ticket 0061"
3. **Wait**: For agent to complete (status shows "Completed")
4. **Verify**: 
   - Ticket 0061 **visibly moves** from its current column to **QA** column on Kanban board (within ~10 seconds after completion)
   - In Diagnostics panel (open Diagnostics), under "Auto-move diagnostics", see an info entry: "Implementation Agent: Moved ticket 0061 to col-qa"
   - After refreshing the page, ticket remains in QA column (persistence confirmed)

### Test Case 2: QA Agent completion (PASS) → Human in the Loop

1. **Setup**: Connect project folder with Supabase credentials
2. **Action**: In QA Agent chat, type "QA ticket 0061" (ticket must be in QA column)
3. **Wait**: For agent to complete with PASS verdict (status shows "Completed")
4. **Verify**:
   - Ticket 0061 **visibly moves** from QA column to **Human in the Loop** column on Kanban board (within ~10 seconds after completion)
   - In Diagnostics panel, under "Auto-move diagnostics", see an info entry: "QA Agent: Moved ticket 0061 to col-human-in-the-loop"
   - After refreshing the page, ticket remains in Human in the Loop column

### Test Case 3: Ticket ID not found (error diagnostic)

1. **Setup**: Connect project folder with Supabase credentials
2. **Action**: Manually trigger a completion message that doesn't contain a ticket ID (simulate edge case)
3. **Verify**:
   - In Diagnostics panel, under "Auto-move diagnostics", see an error entry: "Implementation Agent completion: Could not determine ticket ID from message. Auto-move skipped."
   - Ticket does not move (expected behavior)

### Test Case 4: Supabase update failure (error diagnostic)

1. **Setup**: Connect project folder, then disconnect Supabase (or use invalid credentials)
2. **Action**: In Implementation Agent chat, type "Implement ticket 0061" and wait for completion
3. **Verify**:
   - In Diagnostics panel, under "Auto-move diagnostics", see an error entry explaining why auto-move failed (e.g., "Cannot move ticket 0061: Supabase credentials not available")
   - Ticket does not move (expected behavior)

### Test Case 5: QA Agent completion (FAIL) → no move

1. **Setup**: Connect project folder with Supabase credentials
2. **Action**: In QA Agent chat, type "QA ticket 0061" and wait for completion with FAIL verdict
3. **Verify**:
   - Ticket **does not move** (stays in QA column)
   - No error diagnostic (expected behavior - FAIL verdict should not trigger auto-move)

## Verification notes

- All verification is **UI-only** - no terminal, devtools, or console required
- Kanban board polling interval is ~10 seconds, so moves may take up to 10 seconds to appear
- Diagnostics panel is accessible via "Diagnostics" toggle at bottom of chat region
- Auto-move diagnostics only appear when viewing Implementation Agent or QA Agent chat
