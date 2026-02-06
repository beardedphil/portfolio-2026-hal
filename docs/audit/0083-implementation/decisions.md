# Decisions: 0083 - Auto-move Ready Tickets to To Do on Creation

## Auto-move Implementation

**Decision**: Implement auto-move logic directly in the `create_ticket` tool execution, rather than calling `kanbanMoveTicketToTodoTool` as a separate tool call.

**Rationale**: 
- The ticket is already created and we have the readiness result
- Avoids an extra tool call and simplifies the flow
- Reuses the same position computation logic from `kanbanMoveTicketToTodoTool`
- Keeps the auto-move atomic with ticket creation

## Error Handling

**Decision**: If auto-move fails, return `moveError` in the output but still return `success: true` for ticket creation.

**Rationale**:
- Ticket creation succeeded, so we shouldn't fail the entire operation
- The error is reported to the user via UI message
- Ticket remains in Unassigned, which is a valid state
- User can manually move the ticket later if needed

## UI Message Priority

**Decision**: Show auto-move status messages in this order:
1. If moved to To Do: show success message
2. If move failed: show error message
3. If not ready: show missing items

**Rationale**:
- Prioritizes positive outcomes (successful move)
- Clearly indicates when something went wrong
- Provides actionable feedback when ticket is not ready

## Backward Compatibility

**Decision**: Only modify new ticket creation flow; do not change existing tickets or manual move behavior.

**Rationale**:
- Acceptance criteria explicitly require existing tickets and manual moves to continue working
- Minimizes risk of breaking existing functionality
- Auto-move is opt-in for new tickets only
