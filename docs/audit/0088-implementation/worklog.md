# Worklog: 0088 - QA Agent automatically moves ticket to Doing when starting, and to Human in the Loop/To Do on Pass/Fail

1. **Reviewed ticket requirements** — QA agent should move ticket from QA to Doing when starting, then to Human in the Loop (Pass) or To Do (Fail) on completion
2. **Reviewed existing code**:
   - `api/agent-runs/launch.ts` — Newer endpoint for launching agents (creates run rows)
   - `vite.config.ts` `/api/qa-agent/run` — Older endpoint for QA agent
   - `vite.config.ts` — Pass/Fail move logic (lines 1243-1334)
3. **Added move-to-Doing logic in `api/agent-runs/launch.ts`**:
   - After fetching ticket, check if `agentType === 'qa'` and `currentColumnId === 'col-qa'`
   - If yes, fetch max position in `col-doing`, calculate next position, update ticket in Supabase
   - Error handling: log errors but don't fail launch
4. **Added move-to-Doing logic in `vite.config.ts` `/api/qa-agent/run`**:
   - Modified ticket fetch to include `kanban_column_id` in SELECT
   - After fetching ticket, check if `currentColumnId === 'col-qa'`
   - If yes, move to `col-doing` with same logic as above
5. **Verified Pass/Fail moves**:
   - PASS: moves to `col-human-in-the-loop` (line 1269)
   - FAIL: moves to `col-todo` (line 1326)
   - Both moves work correctly; no changes needed
6. **Created audit artifacts**: plan.md, worklog.md, changed-files.md, decisions.md, verification.md, pm-review.md
