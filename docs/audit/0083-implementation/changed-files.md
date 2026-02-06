# Changed Files: 0083 - Auto-move Ready Tickets to To Do on Creation

## Modified Files

1. **`projects/hal-agents/src/agents/projectManager.ts`**
   - Modified `create_ticket` tool execution (lines 736-825)
   - Added auto-move logic after ticket creation: if ticket is ready, automatically moves to To Do column
   - Computes next position in To Do column (handles repo-scoped and legacy modes)
   - Returns `movedToTodo` and `moveError` in output

2. **`src/App.tsx`**
   - Extended `TicketCreationResult` type (lines 36-45) to include `movedToTodo`, `moveError`, `ready`, and `missingItems`
   - Updated ticket creation summary messages (lines 1307-1320) to show auto-move status

3. **`vite.config.ts`**
   - Extended create_ticket output type extraction (lines 338-351) to include `movedToTodo`, `moveError`, `ready`, and `missingItems`
   - Passes these fields through to frontend in `ticketCreationResult`

## Purpose

- Auto-move ready tickets to To Do on creation
- Show clear UI messages about ticket status and move results
- Maintain backward compatibility with existing tickets and manual moves
