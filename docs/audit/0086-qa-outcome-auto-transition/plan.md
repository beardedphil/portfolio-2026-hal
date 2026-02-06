# Plan: QA Outcome Auto-Transition (0086)

## Goal
Ensure that when the QA agent finishes reviewing a ticket, the ticket automatically transitions to Human in the Loop on pass and back to To Do on fail.

## Approach

1. **Update QA agent FAIL handler in vite.config.ts**
   - When verdict is FAIL, move ticket to `col-todo` (To Do column)
   - Follow same pattern as PASS handler (calculate position, update Supabase, run sync)
   - Update completion message to indicate ticket was moved to To Do

2. **Update auto-move logic in src/App.tsx**
   - Extend QA completion detection to include FAIL patterns
   - Add FAIL detection logic (check for "fail", "verdict.*fail", "qa.*fail" patterns)
   - When FAIL detected, call `moveTicketToColumn` with `col-todo` target
   - Add diagnostic logging for FAIL auto-move attempts

3. **Ensure consistency**
   - Both vite.config.ts (backend QA agent) and src/App.tsx (frontend auto-move) handle FAIL
   - Both use `col-todo` column ID consistently
   - Both update ticket position and kanban_moved_at timestamp

## File touchpoints

- `vite.config.ts` - Update FAIL verdict handler to move ticket to col-todo
- `src/App.tsx` - Update auto-move logic to detect and handle FAIL outcomes
