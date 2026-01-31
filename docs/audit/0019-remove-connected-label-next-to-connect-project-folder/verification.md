# Verification: 0019 - Remove redundant "Connected" label next to Connect Project Folder (UI-only)

## UI-Only Verification Checklist

### Pre-requisites

- [ ] HAL app running (`npm run dev` from repo root)
- [ ] Kanban app running on port 5174

### Test Case 1: Not connected — UI unchanged

1. [ ] Open HAL in browser (no project connected).
2. [ ] **Verify**: "Connect Project Folder" button is visible.
3. [ ] **Verify**: Next to it, "Loading..." or "Connected" (iframe status) is still shown — no regression.
4. [ ] **Verify**: No extra labels or spacing issues in the header.

### Test Case 2: Connected — redundant "Connected" label not shown

1. [ ] Click "Connect Project Folder" and select a project folder with valid .env.
2. [ ] **Verify**: Header shows project name and "Disconnect" button.
3. [ ] **Verify**: The redundant "Connected" label next to the connect control is **not** shown.
4. [ ] **Verify**: No layout shift, overlaps, or misaligned buttons in the header (desktop width).

### Test Case 3: Connection state still clear

1. [ ] With project connected, open Diagnostics (expand "Diagnostics").
2. [ ] **Verify**: "Connected project:" row shows the project name (or equivalent).
3. [ ] **Verify**: Connection state is understandable from Diagnostics and/or header project name.

### Test Case 4: Disconnect still works

1. [ ] With project connected, click "Disconnect".
2. [ ] **Verify**: Project disconnects; "Connect Project Folder" button and iframe status (e.g. "Loading..." / "Connected") appear again as before.

### Build Verification

- [x] `npm run build` completes without errors
- [x] No TypeScript errors
- [x] No lint errors

## Result

**Status**: [ ] PASS (to be checked by human)

**Notes**: Verification requires no external tools (no terminal, devtools, or console) per ticket constraints.
