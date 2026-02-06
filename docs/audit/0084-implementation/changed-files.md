# Changed Files (0084-implementation)

## Modified

- `projects/kanban/src/App.tsx`
  - Added props to `SortableColumn` component: `supabaseBoardActive`, `supabaseColumns`, `supabaseTickets`, `updateSupabaseTicketKanban`, `refetchSupabaseTickets`
  - Modified `handleWorkButtonClick` to automatically move ticket to Doing column when Implementation agent work button is clicked
  - Added message handler for `HAL_TICKET_IMPLEMENTATION_COMPLETE` to move ticket from Doing to QA
  - Updated `SortableColumn` usage to pass new props
  - Enhanced message handler to support ticket lookup by both PK and display_id

- `src/App.tsx`
  - Added postMessage to Kanban iframe when implementation agent completes work successfully
  - Message includes ticket ID for Kanban to identify and move the ticket
