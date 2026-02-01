# Verification: 0042 - Cursor API Configuration Status Panel

## UI Verification Checklist

### Pre-requisites
- [ ] HAL app is running (`npm run dev`)
- [ ] Open http://localhost:5173 in browser

### Test Case 1: Not Configured State

**Setup**: Ensure `.env` does NOT have `VITE_CURSOR_API_KEY` set (or remove/comment it out)

**Steps**:
1. Refresh the page at http://localhost:5173
2. Look at the right sidebar (Chat area)
3. Find the "Configuration" section above the "Diagnostics" toggle

**Expected**:
- [ ] "Configuration" heading is visible
- [ ] Row shows "Cursor API:" label
- [ ] Status shows "Not configured" in red
- [ ] Hint shows "Missing CURSOR_API_KEY in .env"
- [ ] No secret values are displayed anywhere

### Test Case 2: Configured State

**Setup**: Add `VITE_CURSOR_API_KEY=test-key-12345` to `.env` file

**Steps**:
1. Restart the dev server (`npm run dev`)
2. Refresh the page at http://localhost:5173
3. Find the "Configuration" section

**Expected**:
- [ ] "Configuration" heading is visible
- [ ] Row shows "Cursor API:" label
- [ ] Status shows "Configured" in green
- [ ] No secret values are displayed (the actual key "test-key-12345" is NOT shown)
- [ ] No hint text is shown when configured

### Test Case 3: Accessibility

**Steps**:
1. Inspect the Configuration panel in browser devtools

**Expected**:
- [ ] Panel has `role="region"` and `aria-label="Configuration Status"`
- [ ] Status text is readable (sufficient color contrast)

## Acceptance Criteria Verification

From ticket:
- [x] There is an in-app UI area that includes a row for Cursor API status
- [ ] If not configured, UI shows "Not configured" and names missing items without secrets
- [ ] If configured, UI shows "Configured" without displaying secret values
- [ ] UI copy is understandable by a non-technical verifier
