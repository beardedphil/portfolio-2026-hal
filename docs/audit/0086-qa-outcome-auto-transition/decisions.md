# Decisions: QA Outcome Auto-Transition (0086)

## Column ID for To Do

- **Decision**: Use `col-todo` as the target column ID for FAIL outcomes
- **Rationale**: Matches existing convention used throughout the codebase (see `projects/kanban/src/App.tsx` line 110, and various audit files)

## Dual Implementation Points

- **Decision**: Implement FAIL handling in both `vite.config.ts` (QA agent backend) and `src/App.tsx` (frontend auto-move)
- **Rationale**: 
  - `vite.config.ts` handles the QA agent's direct verdict detection from qa-report.md
  - `src/App.tsx` handles auto-move from QA completion messages in chat
  - Both paths need to work for reliability

## FAIL Detection Patterns

- **Decision**: Use regex patterns `/fail|verdict.*fail|qa.*fail/i` to detect FAIL outcomes
- **Rationale**: Matches the pattern used for PASS detection and covers various message formats the QA agent might use

## Position Calculation

- **Decision**: Use same position calculation logic as PASS handler (max position + 1)
- **Rationale**: Consistent behavior - failed tickets appear at the end of To Do column, same as passed tickets appear at end of Human in the Loop
