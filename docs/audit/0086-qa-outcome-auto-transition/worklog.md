# Worklog: QA Outcome Auto-Transition (0086)

1. **Reviewed current QA agent implementation**
   - Found PASS handler in `vite.config.ts` (lines 1217-1280) that moves to Human in the Loop
   - Found FAIL handler (lines 1281-1291) that only writes completion message, doesn't move ticket
   - Found auto-move logic in `src/App.tsx` (lines 1063-1083) that only handles PASS

2. **Updated vite.config.ts FAIL handler**
   - Added ticket move logic to FAIL verdict handler (lines 1281-1320)
   - Moves ticket to `col-todo` column with proper position calculation
   - Updates `kanban_moved_at` timestamp
   - Runs sync-tickets script after move
   - Updates completion message to indicate ticket was moved to To Do

3. **Updated src/App.tsx auto-move logic**
   - Extended QA completion detection regex to include FAIL patterns
   - Added `isFail` detection logic (checks for "fail", "verdict.*fail", "qa.*fail" patterns)
   - Added FAIL branch that calls `moveTicketToColumn(currentTicketId, 'col-todo', 'qa')`
   - Added diagnostic logging for FAIL auto-move attempts

4. **Created audit artifacts**
   - plan.md, worklog.md, changed-files.md, decisions.md, verification.md, pm-review.md
