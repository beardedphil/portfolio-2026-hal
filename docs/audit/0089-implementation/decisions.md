# Decisions: Close Ticket After HITL Pass/Fail (0089)

## Design decisions

### 1. Timing of modal close
- **Decision**: Close modal after `REFETCH_AFTER_MOVE_MS + 100` milliseconds
- **Rationale**: 
  - Ensures the ticket move is reflected in the Kanban board before closing
  - Small additional delay (100ms) ensures refetch has time to complete
  - User sees the ticket move to the new column before modal closes
- **Implementation**: `setTimeout` with `REFETCH_AFTER_MOVE_MS + 100` delay

### 2. Reuse existing close handler
- **Decision**: Use existing `handleCloseTicketDetail` function
- **Rationale**: 
  - Consistent with other modal close behavior
  - Ensures all modal state is properly cleaned up (including artifact viewer)
  - No need to duplicate close logic

### 3. Close after both Pass and Fail
- **Decision**: Close modal after both Pass and Fail actions
- **Rationale**: 
  - Consistent user experience regardless of validation outcome
  - User returns to Kanban board to see the result
  - Matches acceptance criteria requirement
