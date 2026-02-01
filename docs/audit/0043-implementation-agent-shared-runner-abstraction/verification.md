# Verification: 0043 - Abstract shared "agent runner" logic for reuse by Implementation Agent

## UI Verification Checklist

### Pre-requisites
- [ ] HAL app is running (`npm run dev` from repo root)
- [ ] Open http://localhost:5173 in browser
- [ ] Connect a project folder (so chat is enabled)

### Test Case 1: Project Manager still produces responses

**Steps**:
1. Ensure "Project Manager" is selected in the Agent dropdown
2. Type a short message (e.g. "What tickets are in the backlog?") and send
3. Wait for the typing indicator to finish and a reply to appear

**Expected**:
- [ ] PM reply appears in the chat (same as before the refactor)
- [ ] No new errors in the UI; conversation continues normally

### Test Case 2: Diagnostics shows Agent runner line

**Steps**:
1. With Project Manager selected, expand "Diagnostics" (click "Diagnostics ▶")
2. Locate the row "Agent runner:" (after "PM implementation source:")
3. If you have not sent a message yet in this session, send one to PM first, then re-open Diagnostics

**Expected**:
- [ ] A row labeled "Agent runner:" is visible when Project Manager is selected
- [ ] After at least one PM message, the value shows **"v2 (shared)"**
- [ ] Before any PM request, the value may show "—" (em dash)
- [ ] No terminal or devtools required; verification is in-app only

### Test Case 3: No new buttons/toggles

**Steps**:
1. Scan the Chat region and Diagnostics panel

**Expected**:
- [ ] No new buttons or toggles were added for this ticket
- [ ] Verification is via normal PM usage plus the Diagnostics "Agent runner:" line

## Acceptance Criteria Verification

From ticket:
- [ ] Project Manager agent still produces responses in the chat UI after the refactor (basic smoke test)
- [ ] The app's in-app diagnostics shows a visible indicator that the shared runner/abstraction is active
- [ ] No new buttons/toggles are required to verify; human verifies via normal PM usage plus the diagnostics line
