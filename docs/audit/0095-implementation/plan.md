# Plan: 0095-implementation

## Goal
Ensure the Project Manager workflow and UI guarantees that newly created tickets are immediately Ready-to-start (or auto-fixed to be Ready-to-start) and then moved to **To Do**, and that **Prepare top ticket** also moves the ticket once it becomes ready.

## Approach

1. **Enhance create_ticket tool auto-fix logic** (`projects/hal-agents/src/agents/projectManager.ts`):
   - After normalization, if ticket still fails Ready-to-start, try to auto-fix common formatting issues (e.g., convert bullets to checkboxes in Acceptance criteria)
   - Re-evaluate readiness after auto-fix
   - Update ticket in DB if auto-fix made it ready
   - Return `autoFixed` flag in output

2. **Update PM agent system instructions** (`projects/hal-agents/src/agents/projectManager.ts`):
   - Add explicit instruction for "Prepare top ticket" workflow: fetch → evaluate → fix if needed → move to To Do if ready
   - Ensure PM agent automatically moves tickets to To Do when they become ready after preparation

3. **Enhance UI confirmation messages** (`src/App.tsx`, `vite.config.ts`):
   - Update ticket creation result type to include `autoFixed` flag
   - Show explicit "Ready-to-start" status in confirmation messages
   - Include auto-fix notification when formatting issues were resolved
   - Provide clear error messages for all failure scenarios (validation, update, move)

4. **Error handling**:
   - Ensure all failure paths show clear, actionable error messages
   - Distinguish between fixable formatting issues and missing content that requires manual intervention
