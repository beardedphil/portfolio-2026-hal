# Verification: 0027 - Chat UI: make user vs assistant messages clearly distinguishable (UI-only)

## UI-Only Verification Checklist

### Pre-requisites

- [ ] HAL app running (`npm run dev` from repo root)
- [ ] Kanban app running on port 5174
- [ ] Project folder connected (required for chat)

### Test Case 1: User vs assistant distinction — PM chat

1. [ ] Connect a project folder.
2. [ ] Select "Project Manager" in the Agent dropdown.
3. [ ] Send a short message (e.g., "Hello").
4. [ ] **Verify**: User message appears right-aligned with purple bubble and "You" label.
5. [ ] **Verify**: PM reply appears left-aligned with neutral bubble and "HAL" label.
6. [ ] **Verify**: Authorship is obvious at a glance.

### Test Case 2: Long messages and code blocks

1. [ ] Send a message that elicits a long multi-paragraph reply from PM.
2. [ ] **Verify**: Long assistant messages remain left-aligned with "HAL" label; content wraps correctly.
3. [ ] **Verify**: If a reply contains JSON or preformatted text, it has a distinct background and horizontal scroll when needed.

### Test Case 3: Implementation Agent (stub) and Standup

1. [ ] Select "Implementation Agent (stub)". Send a message.
2. [ ] **Verify**: User message right-aligned ("You"); stub reply left-aligned ("HAL").
3. [ ] Select "Standup (all agents)". Send a message.
4. [ ] **Verify**: Standup output shows "HAL" for agent messages, "System" for separators; layout remains clear.

### Test Case 4: Typing indicator

1. [ ] Select PM, send a message.
2. [ ] **Verify**: "Thinking" indicator appears left-aligned with "HAL" label, matching assistant bubble style.
3. [ ] **Verify**: Indicator disappears when reply appears.

### Test Case 5: Contrast and accessibility

1. [ ] **Verify**: User bubble: white text on purple — sufficient contrast.
2. [ ] **Verify**: Assistant bubble: dark text on light background — no "gray on gray".
3. [ ] **Verify**: Both message types are readable without straining.

### Test Case 6: Narrow width

1. [ ] Resize browser to narrow width (e.g., ~400px) or use responsive mode.
2. [ ] **Verify**: Chat layout does not break; bubbles remain readable; no overflow issues.

### Build Verification

- [x] `npm run build` completes without errors
- [x] No TypeScript errors
- [x] No lint errors

## Result

**Status**: [ ] PASS (requires manual UI verification with project connected)

**Notes**: Verification is UI-only per ticket. Run `npm run dev`, connect a project, and perform the test cases above. Screenshots may be added to this folder if used for QA.
