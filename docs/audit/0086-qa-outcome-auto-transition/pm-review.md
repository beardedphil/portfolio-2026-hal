# PM Review: QA Outcome Auto-Transition (0086)

## Likelihood of Success: 95%

High confidence. The implementation follows existing patterns (PASS handler) and uses well-established column IDs and move logic.

## Potential Failures (ranked by likelihood)

### 1. **FAIL detection regex doesn't match QA agent message format** (Medium)
- **Symptoms**: QA agent reports FAIL but ticket doesn't move to To Do
- **Diagnosis**: Check Diagnostics panel → Auto-move diagnostics. If no entry for FAIL, detection may have failed. Check QA Agent completion message format against regex patterns in `src/App.tsx:1068`
- **In-app**: Diagnostics panel shows no auto-move attempt for FAIL outcome

### 2. **Column ID mismatch** (Low)
- **Symptoms**: Ticket moves but appears in wrong column or doesn't appear
- **Diagnosis**: Check Supabase `tickets.kanban_column_id` value. Verify `col-todo` exists in `kanban_columns` table. Check Kanban board column mapping.
- **In-app**: Kanban board shows ticket in unexpected column or ticket disappears

### 3. **Position calculation error** (Low)
- **Symptoms**: Ticket appears in To Do but at wrong position
- **Diagnosis**: Check Supabase `tickets.kanban_position` value. Verify position calculation logic matches PASS handler.
- **In-app**: Ticket appears in unexpected position within To Do column

### 4. **Backend move succeeds but frontend auto-move also triggers** (Low)
- **Symptoms**: Ticket moves twice or position conflicts
- **Diagnosis**: Check Diagnostics panel for duplicate auto-move entries. Verify only one path (backend or frontend) handles the move.
- **In-app**: Ticket position may be incorrect or diagnostics show duplicate moves

### 5. **Sync script fails silently** (Low)
- **Symptoms**: Ticket moves in Supabase but ticket file doesn't update
- **Diagnosis**: Check `docs/tickets/` for ticket file. Verify sync-tickets script runs successfully (check console logs in vite.config.ts).
- **In-app**: Not directly visible; requires checking file system

## Verification Checklist

- [ ] QA PASS moves ticket to Human in the Loop (visible in Kanban board)
- [ ] QA FAIL moves ticket to To Do (visible in Kanban board)
- [ ] Ticket detail view shows correct column after move
- [ ] Column header counts update correctly after move
- [ ] No duplicate moves (check Diagnostics panel)
