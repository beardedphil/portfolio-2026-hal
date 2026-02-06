# Decisions (0084-implementation)

## Automatic column movement on work button click

- **Decision**: Move ticket to Doing immediately when Implementation agent work button is clicked, before opening chat
- **Rationale**: Ensures ticket is in Doing as soon as work begins, providing immediate visual feedback
- **Alternative considered**: Move after agent confirms work start - rejected because it requires additional agent communication

## Completion message format

- **Decision**: Use `HAL_TICKET_IMPLEMENTATION_COMPLETE` message type with `ticketId` field
- **Rationale**: Consistent with existing HAL message pattern, allows Kanban to identify ticket by display_id or PK
- **Alternative considered**: Pass ticket PK directly - rejected because HAL app only has display_id at completion time

## Ticket lookup strategy

- **Decision**: Support lookup by both PK (UUID) and display_id (e.g., HAL-0084 or 0084)
- **Rationale**: HAL app sends display_id, but Kanban uses PKs internally; lookup handles both cases
- **Implementation**: First try PK match, then normalize display_id and match against ticket display_id or id fields

## Column movement validation

- **Decision**: Only move to Doing if ticket is in To Do or Unassigned; only move to QA if ticket is in Doing
- **Rationale**: Prevents incorrect moves if ticket was manually moved or state is inconsistent
- **Impact**: Safe operation that respects current ticket state
