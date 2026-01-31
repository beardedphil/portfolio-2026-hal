# Verification: 0024 - Chat typing indicator + purple color palette (UI-only)

## UI-Only Verification Checklist

### Pre-requisites

- [ ] HAL app running (`npm run dev` from repo root)
- [ ] Kanban app running on port 5174
- [ ] Project folder connected (required for chat)

### Test Case 1: Typing indicator — PM

1. [ ] Connect a project folder.
2. [ ] Ensure "Project Manager" is selected in the Agent dropdown.
3. [ ] Type a message and click Send.
4. [ ] **Verify**: An animated "Thinking" bubble with bouncing dots appears in the chat transcript immediately after sending.
5. [ ] **Verify**: The indicator disappears when the PM’s reply appears.
6. [ ] **Verify**: Animation is subtle (not distracting).

### Test Case 2: Typing indicator — Implementation Agent (stub)

1. [ ] Select "Implementation Agent (stub)" in the Agent dropdown.
2. [ ] Send a message.
3. [ ] **Verify**: "Thinking" indicator appears.
4. [ ] **Verify**: Indicator disappears when the stub response appears (~500ms).

### Test Case 3: Typing indicator — Standup

1. [ ] Select "Standup (all agents)" in the Agent dropdown.
2. [ ] Send a message.
3. [ ] **Verify**: "Thinking" indicator appears.
4. [ ] **Verify**: Indicator disappears when the standup output finishes (~900ms).

### Test Case 4: Purple palette

1. [ ] **Verify**: Header uses a purple/dark purple background (not blue/gray).
2. [ ] **Verify**: "Connect Project Folder" and "Send" buttons are purple (or purple accent).
3. [ ] **Verify**: Chat area (backgrounds, borders) uses purple-tinted neutrals.
4. [ ] **Verify**: Overall look is consistent and easy on the eye.

### Test Case 5: Tab switch during typing

1. [ ] Send a message to PM.
2. [ ] While "Thinking" is visible, switch to "Implementation Agent (stub)" tab.
3. [ ] **Verify**: Typing indicator is NOT shown in the Implementation Agent transcript (it belongs to PM).
4. [ ] Switch back to PM.
5. [ ] **Verify**: Either the indicator is still visible (if PM hasn’t replied) or the reply is shown.

### Build Verification

- [x] `npm run build` completes without errors
- [x] No TypeScript errors
- [x] No lint errors

## Result

**Status**: [ ] PASS (to be checked by human)

**Notes**: Verification requires no external tools (no terminal, devtools, or console) per ticket constraints.
