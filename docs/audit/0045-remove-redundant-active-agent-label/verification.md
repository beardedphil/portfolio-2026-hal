# Verification: 0045 - Remove redundant "Active: {active_agent}" label

## UI Verification Checklist

### Pre-requisites
- [ ] HAL app is running (`npm run dev`)
- [ ] Open http://localhost:5173 in browser
- [ ] Connect a project folder (required for chat to be enabled)

### Test Case 1: No "Active:" label visible

**Steps**:
1. Look at the chat header (above the transcript)
2. Check for any text reading "Active:" or "Active: …"

**Expected**:
- [ ] No "Active:" label appears anywhere in the app
- [ ] The agent selector shows only "Agent:" and the dropdown

### Test Case 2: Dropdown still works

**Steps**:
1. Select "Project Manager" from the agent dropdown
2. Select "Implementation Agent"
3. Switch between agents

**Expected**:
- [ ] The dropdown reflects the selected agent correctly
- [ ] Switching agents works normally
- [ ] The selected agent is visible in the dropdown (e.g. "Project Manager", "Implementation Agent")

### Test Case 3: No blank gap

**Steps**:
1. Inspect the chat header area visually

**Expected**:
- [ ] No empty row or visible gap where the "Active: …" label previously appeared
- [ ] Layout flows naturally from the "Chat" heading to the agent selector

## Acceptance Criteria Verification

From ticket:
- [x] The UI does not display any "Active:" label for the selected agent anywhere in the app
- [x] Switching the agent via the agent dropdown still works normally; selected agent visible in dropdown
- [x] No blank gap/extra row remains where the label previously appeared
