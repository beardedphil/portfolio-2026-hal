# Verification: 0088 - QA Agent automatically moves ticket to Doing when starting, and to Human in the Loop/To Do on Pass/Fail

## UI-only verification steps

### Test Case 1: QA Agent starts work (move to Doing)

1. **Prerequisites**: 
   - Ensure a ticket exists in the **QA** column
   - Supabase is connected
   - Cursor API is configured

2. **Steps**:
   - Open HAL app
   - Navigate to Kanban board
   - Locate a ticket in the **QA** column
   - Click "QA top ticket" button (or manually start QA via chat: "QA ticket XXXX")

3. **Expected results**:
   - Within a few seconds, the ticket card **visibly moves** from the **QA** column to the **Doing** column on the Kanban board
   - The ticket detail view (if open) shows the updated column (Doing)
   - QA agent chat shows progress/status

4. **Verify persistence**:
   - Wait ~30 seconds
   - Refresh the page (F5)
   - The ticket **remains** in the **Doing** column (move persisted to Supabase)

### Test Case 2: QA Pass (move to Human in the Loop)

1. **Prerequisites**:
   - A ticket is in the **Doing** column (after QA started)
   - QA agent completes with PASS verdict

2. **Steps**:
   - Wait for QA agent to complete
   - QA agent generates qa-report.md with PASS verdict
   - QA agent moves ticket to Human in the Loop

3. **Expected results**:
   - The ticket card **visibly moves** from the **Doing** column to the **Human in the Loop** column
   - The ticket detail view shows the updated column (Human in the Loop)
   - QA chat shows "QA PASSED" message

4. **Verify persistence**:
   - Wait ~30 seconds
   - Refresh the page (F5)
   - The ticket **remains** in the **Human in the Loop** column

### Test Case 3: QA Fail (move to To Do)

1. **Prerequisites**:
   - A ticket is in the **Doing** column (after QA started)
   - QA agent completes with FAIL verdict

2. **Steps**:
   - Wait for QA agent to complete
   - QA agent generates qa-report.md with FAIL verdict
   - QA agent moves ticket to To Do

3. **Expected results**:
   - The ticket card **visibly moves** from the **Doing** column to the **To Do** column
   - The ticket detail view shows the updated column (To Do)
   - QA chat shows "QA FAILED" message

4. **Verify persistence**:
   - Wait ~30 seconds
   - Refresh the page (F5)
   - The ticket **remains** in the **To Do** column

### Test Case 4: Ticket already in Doing (no backwards move)

1. **Prerequisites**:
   - A ticket is already in the **Doing** column (not in QA)

2. **Steps**:
   - Manually start QA on this ticket (via chat: "QA ticket XXXX")

3. **Expected results**:
   - The ticket **does not move backwards** (stays in Doing)
   - QA agent run proceeds normally
   - Ticket remains in Doing throughout QA work

## In-app diagnostics

- **Auto-move diagnostics**: Check Diagnostics panel for "QA Agent: Moved ticket XXXX to col-doing" messages
- **Error messages**: If move fails, error is logged to console (but launch continues)
