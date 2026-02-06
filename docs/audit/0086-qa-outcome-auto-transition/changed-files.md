# Changed Files: QA Outcome Auto-Transition (0086)

## Modified Files

- **vite.config.ts**
  - Updated FAIL verdict handler (lines 1281-1320) to move ticket to `col-todo` column
  - Added Supabase update logic with position calculation
  - Added sync-tickets script execution after move
  - Updated completion message to indicate ticket moved to To Do

- **src/App.tsx**
  - Updated QA completion detection regex to include FAIL patterns (line 1066)
  - Added `isFail` detection logic (line 1068)
  - Added FAIL branch that moves ticket to `col-todo` (lines 1075-1085)
  - Added diagnostic logging for FAIL auto-move attempts
