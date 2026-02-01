# PM Review: 0069 - Make "Work top ticket" buttons reliably start agent runs

## Likelihood of success: 95%

The implementation is straightforward and reuses existing, well-tested agent run logic. The main risk is ensuring the `triggerAgentRun` function dependencies are correctly captured.

## Potential failures and diagnosis

### 1. Agent run doesn't start (5% likelihood)
- **Symptoms:** Button click opens chat and shows message, but no run status appears
- **Diagnosis:** Check browser console for errors. Verify `triggerAgentRun` is being called (add console.log). Check that `HAL_OPEN_CHAT_AND_SEND` handler dependencies include `triggerAgentRun`.
- **In-app:** Status message should appear; if it doesn't, the function isn't being called.

### 2. Ticket ID not shown in status (2% likelihood)
- **Symptoms:** Status message appears but doesn't include ticket ID
- **Diagnosis:** Check that `extractTicketId` correctly parses the message format. Verify message format from Kanban matches expected pattern ("Implement ticket XXXX" or "QA ticket XXXX").
- **In-app:** Status message will show "[Status] Starting Implementation run for ticket..." without ID if extraction fails.

### 3. Error messages not clear (1% likelihood)
- **Symptoms:** Errors occur but message is unclear
- **Diagnosis:** Check error handling in `triggerAgentRun`. Verify Cursor API configuration check message is user-friendly.
- **In-app:** Error messages appear in chat; check Diagnostics panel for detailed error info.

### 4. Duplicate message in chat (1% likelihood)
- **Symptoms:** User message appears twice
- **Diagnosis:** Check that `addMessage` is only called once in `HAL_OPEN_CHAT_AND_SEND` handler, and `triggerAgentRun` doesn't add it again for non-DB cases.
- **In-app:** Chat transcript will show duplicate user messages.

## Verification checklist

- [ ] Click Implementation button → chat opens, status shows, run starts
- [ ] Click QA button → chat opens, status shows, run starts
- [ ] Status messages include ticket ID
- [ ] Error messages are clear when Cursor API not configured
- [ ] No duplicate messages in chat
- [ ] Run status timeline appears and updates correctly
