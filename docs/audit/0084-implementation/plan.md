# Plan (0084-implementation)

## Goal

Ensure a ticket automatically moves to Doing when an Implementation agent starts work and remains there until the agent marks work complete and moves it to QA.

## Approach

- Modify `handleWorkButtonClick` in `SortableColumn` to automatically move the ticket to Doing when the Implementation agent work button is clicked from To Do or Unassigned columns
- Add a postMessage handler in Kanban to listen for `HAL_TICKET_IMPLEMENTATION_COMPLETE` messages from the HAL app
- Update HAL app to send `HAL_TICKET_IMPLEMENTATION_COMPLETE` message when the implementation agent run completes successfully
- Ensure ticket detail view reflects column changes (already handled by existing refetch logic)
- Column counts update automatically via existing column computation logic

## Files

- `projects/kanban/src/App.tsx`: 
  - Add props to `SortableColumn` for Supabase functions and state
  - Modify `handleWorkButtonClick` to move ticket to Doing for implementation-agent
  - Add message handler for `HAL_TICKET_IMPLEMENTATION_COMPLETE` to move from Doing to QA
- `src/App.tsx`: 
  - Send `HAL_TICKET_IMPLEMENTATION_COMPLETE` postMessage to Kanban iframe when implementation agent completes
- `docs/audit/0084-implementation/*`
