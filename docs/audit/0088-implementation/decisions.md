# Decisions: 0088 - QA Agent automatically moves ticket to Doing when starting, and to Human in the Loop/To Do on Pass/Fail

## Move-to-Doing on QA start

- **Decision**: Move ticket from QA to Doing when QA agent starts work, not when QA completes
- **Why**: Matches the pattern used by Implementation Agent (moves to Doing when starting work)
- **Implementation**: Check if ticket is in `col-qa` before moving; only move if in QA column
- **Error handling**: Log errors but don't fail the launch (ticket stays in QA if move fails)

## Pass/Fail moves

- **Decision**: Use existing Pass/Fail move logic (no changes needed)
- **Why**: Existing code already moves correctly:
  - PASS: moves to `col-human-in-the-loop`
  - FAIL: moves to `col-todo`
- **Note**: Moves happen regardless of current column (will work correctly since ticket is in Doing after QA starts)

## Two QA endpoints

- **Decision**: Add move-to-Doing logic in both `api/agent-runs/launch.ts` and `vite.config.ts` `/api/qa-agent/run`
- **Why**: Both endpoints can be used to start QA work; both need the move logic
- **Implementation**: Same logic in both places (check column, move if in QA)
