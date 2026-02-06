# Plan: 0088 - QA Agent automatically moves ticket to Doing when starting, and to Human in the Loop/To Do on Pass/Fail

## Goal
Ensure a ticket automatically moves to Doing when a QA agent starts working it, and then moves to Human in the Loop on QA pass or back to To Do on QA fail.

## Approach

1. **QA agent start (move to Doing)**:
   - In `api/agent-runs/launch.ts`: When `agentType === 'qa'` and ticket is in `col-qa`, move to `col-doing` before launching the agent
   - In `vite.config.ts` `/api/qa-agent/run`: When QA starts, check if ticket is in `col-qa` and move to `col-doing`
   - Calculate next position in Doing column (max position + 1)
   - Update `kanban_column_id`, `kanban_position`, and `kanban_moved_at` in Supabase
   - Error handling: log errors but don't fail the launch (ticket stays in QA if move fails)

2. **QA Pass/Fail moves (already implemented)**:
   - Verify existing logic in `vite.config.ts` moves correctly:
     - PASS: moves from Doing to `col-human-in-the-loop`
     - FAIL: moves from Doing to `col-todo`
   - These moves already work correctly; no changes needed

3. **Ticket detail view sync**:
   - Kanban board polls Supabase every ~10s, so column changes are reflected automatically
   - Ticket detail view reads from Supabase, so it will show updated column

## File touchpoints

- `api/agent-runs/launch.ts` — Add move-to-Doing logic when QA agent starts (after ticket fetch, before prompt building)
- `vite.config.ts` — Add move-to-Doing logic in `/api/qa-agent/run` endpoint (after ticket fetch, before launching agent)
- `vite.config.ts` — Verify Pass/Fail moves work correctly (lines 1243-1334)
