# Verification: 0072 - Ensure each Kanban column header "work top ticket" button sends exactly one message per click

## Code review

### Requirement: Single message per click for PM button
- **Implementation**: `HAL_OPEN_CHAT_AND_SEND` handler no longer calls `addMessage`; `triggerAgentRun` handles it
- **File**: `src/App.tsx:1408-1425`
- **Status**: ✅ PASS

### Requirement: Single message per click for Implementation button
- **Implementation**: Same fix applies to all chat targets
- **File**: `src/App.tsx:1408-1425`
- **Status**: ✅ PASS

### Requirement: Single message per click for QA button
- **Implementation**: Same fix applies to all chat targets
- **File**: `src/App.tsx:1408-1425`
- **Status**: ✅ PASS

### Requirement: Diagnostic indicator for work button clicks
- **Implementation**: `lastWorkButtonClick` state tracks event ID, timestamp, chat target, and message
- **Display**: Diagnostic row in diagnostics panel shows event ID and timestamp
- **File**: `src/App.tsx:1407` (state), `src/App.tsx:2203-2212` (display)
- **Status**: ✅ PASS

## UI verification steps (manual)

1. **PM button test**:
   - Open HAL app at http://localhost:5173
   - Ensure Kanban is connected and has tickets in Unassigned column
   - Click "Prepare top ticket" button once
   - Verify exactly one message appears in PM chat
   - Open Diagnostics panel and verify "Last work button click" shows the event ID and timestamp

2. **Implementation button test**:
   - Ensure tickets exist in To-do column
   - Click "Implement top ticket" button once
   - Verify exactly one message appears in Implementation chat
   - Check Diagnostics panel shows updated event ID and timestamp

3. **QA button test**:
   - Ensure tickets exist in QA column
   - Click "QA top ticket" button once
   - Verify exactly one message appears in QA chat
   - Check Diagnostics panel shows updated event ID and timestamp

4. **Diagnostic indicator test**:
   - Click any work button
   - Open Diagnostics panel (click "Diagnostics ▶" button)
   - Verify "Last work button click" row appears with:
     - Event ID (format: `work-btn-<timestamp>-<random>`)
     - Timestamp (formatted time)
     - Chat target name

## Automated checks

- Build: `npm run build` (should pass)
- Lint: Check for TypeScript errors (should pass)
