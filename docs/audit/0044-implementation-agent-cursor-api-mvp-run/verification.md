# Verification: 0044 - Implementation Agent Cursor API MVP Run

## UI Verification Checklist

### Pre-requisites
- [ ] HAL app is running (`npm run dev`)
- [ ] Open http://localhost:5173 in browser
- [ ] Connect a project folder (required for chat to be enabled)

### Test Case 1: Cursor API Not Configured

**Setup**: Ensure `.env` does NOT have `VITE_CURSOR_API_KEY` or `CURSOR_API_KEY` set

**Steps**:
1. Select "Implementation Agent" from the agent dropdown
2. Type a message (e.g. "Hello") and send
3. Do NOT open devtools or console

**Expected**:
- [ ] User message appears in chat
- [ ] A reply appears immediately: "[Implementation Agent] Cursor API is not configured. Set CURSOR_API_KEY and VITE_CURSOR_API_KEY in .env to enable this agent."
- [ ] No status timeline shown (request not attempted)
- [ ] Configuration panel shows "Not configured"

### Test Case 2: Cursor API Configured — Success

**Setup**: Add `CURSOR_API_KEY=your-real-key` and `VITE_CURSOR_API_KEY=your-real-key` to `.env` (use a valid Cursor API key from Cursor Dashboard → Integrations)

**Steps**:
1. Restart dev server, refresh page, connect project
2. Select "Implementation Agent"
3. Type a message (e.g. "Test") and send
4. Watch the status area during the request

**Expected**:
- [ ] Status timeline appears: Preparing request → Sending to Cursor API → Waiting → Completed
- [ ] "Completed" shown briefly (green)
- [ ] Reply appears in chat: "[Implementation Agent] Cursor API connected. Authenticated as [email] (API key: [name])."
- [ ] No secrets displayed (actual key value never shown)
- [ ] No console or devtools needed to verify

### Test Case 3: Cursor API Configured — Failure (Invalid Key)

**Setup**: Add `CURSOR_API_KEY=invalid-key` and `VITE_CURSOR_API_KEY=invalid-key` to `.env`

**Steps**:
1. Restart dev server, refresh, connect project
2. Select "Implementation Agent"
3. Send a message

**Expected**:
- [ ] Status timeline shows: Preparing → Sending → Waiting → Failed
- [ ] "Failed" shown in red briefly
- [ ] Reply: "[Implementation Agent] Request failed: Cursor API authentication failed. Check that CURSOR_API_KEY is valid."
- [ ] Human-readable error, no stack trace

### Test Case 4: Banner and Config Panel

**Steps**:
1. With Cursor API configured, select Implementation Agent
2. Check the banner above the chat transcript
3. Check the Configuration section

**Expected**:
- [ ] Banner says "Implementation Agent — Cursor API (MVP)" and "Send a message to run a minimal Cursor API test..."
- [ ] Configuration panel shows "Cursor API: Configured"
- [ ] When not configured, banner says "Cursor API is not configured..."
- [ ] Config hint mentions both CURSOR_API_KEY and VITE_CURSOR_API_KEY

## Acceptance Criteria Verification

From ticket:
- [x] With Implementation Agent selected, sending a chat message visibly starts a run and shows in-app status/progress indicator
- [x] If Cursor API is not configured, UI shows clear error state and does not attempt the request
- [x] If Cursor API is configured, UI shows success state and displays returned content in chat
- [x] If Cursor API request fails, UI shows failure state with human-readable error summary (no stack trace)
