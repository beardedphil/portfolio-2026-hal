# Verification: QA Outcome Auto-Transition (0086)

## UI-Only Verification Steps

### Test Case 1: QA PASS moves ticket to Human in the Loop
1. **Setup**: Have a ticket in QA column
2. **Action**: Trigger QA agent with "QA ticket XXXX" and wait for PASS outcome
3. **Verify**: 
   - Ticket card moves from QA column to Human in the Loop column on Kanban board
   - Ticket detail view shows ticket is in Human in the Loop column
   - Column header counts update correctly (QA count decreases, Human in the Loop count increases)

### Test Case 2: QA FAIL moves ticket to To Do
1. **Setup**: Have a ticket in QA column
2. **Action**: Trigger QA agent with "QA ticket XXXX" and wait for FAIL outcome (or manually create a qa-report.md with FAIL verdict)
3. **Verify**:
   - Ticket card moves from QA column to To Do column on Kanban board
   - Ticket detail view shows ticket is in To Do column
   - Column header counts update correctly (QA count decreases, To Do count increases)

### Test Case 3: Ticket detail view matches board after move
1. **Setup**: Complete Test Case 1 or 2
2. **Action**: Open ticket detail view from Kanban board
3. **Verify**: 
   - Ticket detail view shows the same column as the Kanban board
   - No mismatch between detail view and board

### Test Case 4: Column header counts update correctly
1. **Setup**: Note the count in QA, To Do, and Human in the Loop columns
2. **Action**: Complete Test Case 1 or 2
3. **Verify**:
   - QA column count decreases by 1
   - Target column (To Do or Human in the Loop) count increases by 1
   - Other column counts remain unchanged

## Automated Checks

- Code review: Verify both `vite.config.ts` and `src/App.tsx` have FAIL handling
- Build: Run `npm run build` to ensure no TypeScript errors
- Lint: Run linter to ensure code style compliance
