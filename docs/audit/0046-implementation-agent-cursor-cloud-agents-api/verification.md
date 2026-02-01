# Verification (0046-implementation-agent-cursor-cloud-agents-api)

## UI Verification Checklist

### Pre-requisites

- [ ] HAL app is running (`npm run dev`)
- [ ] Kanban is running (port 5174)
- [ ] Open http://localhost:5173 in browser
- [ ] Connect a project folder (required for chat; provides Supabase creds for move-to-QA)
- [ ] Project has a GitHub remote (`git remote get-url origin` returns a GitHub URL)
- [ ] Cursor API key configured in .env (CURSOR_API_KEY, VITE_CURSOR_API_KEY)
- [ ] Supabase configured in .env (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) and project .env

### Test Case 1: "Implement ticket XXXX" — Full flow (happy path)

**Setup**: Valid ticket exists (e.g. 0046) in docs/tickets or Supabase; Cursor API and Supabase configured; GitHub remote present.

**Steps**:
1. Select "Implementation Agent"
2. Type "Implement ticket 0046" and send
3. Observe status timeline and chat without using devtools/console

**Expected**:
- [ ] Status timeline shows: Preparing → Fetching ticket → Resolving repo → Launching agent → Running → Completed
- [ ] "Completed" shown in green
- [ ] Reply appears with summary and PR link (if Cursor created one)
- [ ] Reply includes "Ticket 0046 moved to QA"
- [ ] Kanban board shows ticket 0046 in QA column (may require refresh or ~10s poll)
- [ ] No secrets displayed

### Test Case 2: Invalid input

**Steps**:
1. Select Implementation Agent
2. Type "Hello" or "Do something" (not "Implement ticket XXXX") and send

**Expected**:
- [ ] Reply: "Say 'Implement ticket XXXX' (e.g. Implement ticket 0046) to implement a ticket."
- [ ] Human-readable, no stack trace

### Test Case 3: Ticket not found

**Steps**:
1. Type "Implement ticket 9999" (non-existent ticket)
2. Send

**Expected**:
- [ ] Reply indicates ticket not found (from Supabase or docs/tickets)
- [ ] Clear error, no stack trace

### Test Case 4: No GitHub remote

**Setup**: Temporarily remove or rename git remote, or use a project with no GitHub origin.

**Steps**:
1. Type "Implement ticket 0046" and send

**Expected**:
- [ ] Reply: "No GitHub remote found..." or "Could not resolve GitHub repository..."
- [ ] Error shown before Cursor API request attempted
- [ ] No Cursor API call for launch

### Test Case 5: Cursor API not configured

**Setup**: Remove CURSOR_API_KEY and VITE_CURSOR_API_KEY from .env (or use empty values).

**Steps**:
1. Select Implementation Agent
2. Type "Implement ticket 0046" and send

**Expected**:
- [ ] Immediate message: "Cursor API is not configured. Set CURSOR_API_KEY and VITE_CURSOR_API_KEY in .env to enable this agent."
- [ ] No request to backend (client-side check)

### Test Case 6: Cursor API failure (e.g. invalid key)

**Setup**: Set CURSOR_API_KEY to an invalid value.

**Steps**:
1. Type "Implement ticket 0046" and send

**Expected**:
- [ ] Status timeline progresses through stages, ends at Failed
- [ ] Reply with human-readable error (e.g. "Cursor API authentication failed...")
- [ ] No stack trace

### Test Case 7: Banner and Configuration

**Steps**:
1. With Implementation Agent selected, check banner
2. Check Configuration panel

**Expected**:
- [ ] Banner: "Implementation Agent — Cursor Cloud Agents"
- [ ] Hint: "Say 'Implement ticket XXXX' (e.g. Implement ticket 0046) to fetch the ticket, launch a Cursor cloud agent, and move the ticket to QA when done."
- [ ] Configuration panel shows Cursor API status (Configured / Not configured)

## Acceptance Criteria Verification

From ticket:
- [x] "Implement ticket XXXX" parses ticket ID and fetches from Supabase or docs/tickets
- [x] Prompt built from Goal, Human-verifiable deliverable, Acceptance criteria; passed to POST /v0/agents
- [x] Request triggers POST /v0/agents with ticket prompt and repo URL as source.repository
- [x] UI shows status timeline (Fetching ticket → Launching → Running → Completed/Failed)
- [x] On FINISHED: displays summary and PR link in chat
- [x] On FINISHED: moves ticket to QA in Supabase (kanban_column_id = 'col-qa')
- [x] User can say "Implement ticket XXXX" and do nothing else until ticket in QA
- [x] No GitHub remote: clear error without attempting request
- [x] Cursor API not configured or request fails: human-readable error, no stack trace
