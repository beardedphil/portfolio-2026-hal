# Verification: 0069 - Make "Work top ticket" buttons reliably start agent runs

## Code review

### Acceptance criteria verification

- [x] **Implementation column header button opens Implementation chat and shows run initiation status**
  - `HAL_OPEN_CHAT_AND_SEND` handler calls `triggerAgentRun` (line 1198)
  - Status message shows ticket ID: `[Status] Starting Implementation run for ticket ${ticketId}...` (line 823)
  - Run status timeline appears showing "Preparing → Fetching ticket → ..." stages

- [x] **QA column header button opens QA chat and shows run initiation status**
  - `HAL_OPEN_CHAT_AND_SEND` handler calls `triggerAgentRun` (line 1198)
  - Status message shows ticket ID: `[Status] Starting QA run for ticket ${ticketId}...` (line 1005)
  - Run status timeline appears showing "Preparing → Fetching ticket → ..." stages

- [x] **Error handling for missing configuration**
  - Cursor API check shows: `[Implementation Agent] Cursor API is not configured...` (line 807)
  - Cursor API check shows: `[QA Agent] Cursor API is not configured...` (line 989)

- [x] **Error handling for API errors**
  - API errors are caught and displayed: `[Implementation Agent] ${errorMsg}` (line 982)
  - API errors are caught and displayed: `[QA Agent] ${errorMsg}` (line 1158)

- [x] **Ticket ID clearly indicated**
  - Status message includes ticket ID: `[Status] Starting Implementation run for ticket ${ticketId}...` (line 823)
  - Status message includes ticket ID: `[Status] Starting QA run for ticket ${ticketId}...` (line 1005)
  - User message also includes ticket ID: "Implement ticket 0069" or "QA ticket 0069"

## Manual verification steps

1. **Test Implementation button:**
   - Place a ticket in the "To-do" column
   - Click "Implement top ticket" button in the column header
   - Verify: Chat switches to Implementation Agent
   - Verify: User message appears: "Implement ticket XXXX"
   - Verify: Status message appears: "[Status] Starting Implementation run for ticket XXXX..."
   - Verify: Run status timeline appears showing progress stages
   - Verify: If Cursor API not configured, error message appears

2. **Test QA button:**
   - Place a ticket in the "QA" column
   - Click "QA top ticket" button in the column header
   - Verify: Chat switches to QA Agent
   - Verify: User message appears: "QA ticket XXXX"
   - Verify: Status message appears: "[Status] Starting QA run for ticket XXXX..."
   - Verify: Run status timeline appears showing progress stages
   - Verify: If Cursor API not configured, error message appears

3. **Test error cases:**
   - With Cursor API not configured, click Implementation button
   - Verify: Clear error message appears explaining missing configuration
   - With Cursor API not configured, click QA button
   - Verify: Clear error message appears explaining missing configuration
