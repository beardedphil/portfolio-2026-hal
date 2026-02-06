# Changed Files: 0095-implementation

## Modified files

1. **`projects/hal-agents/src/agents/projectManager.ts`**:
   - Enhanced `create_ticket` tool execution to auto-fix formatting issues (convert bullets to checkboxes in Acceptance criteria)
   - Added `autoFixed` flag to create_ticket output
   - Updated PM agent system instructions to handle "Prepare top ticket" workflow with automatic move to To Do

2. **`src/App.tsx`**:
   - Added `autoFixed` field to `TicketCreationResult` type
   - Enhanced ticket creation confirmation messages to show explicit Ready-to-start status and auto-fix notifications
   - Improved error messages to guide users on next steps

3. **`vite.config.ts`**:
   - Updated ticket creation result extraction to include `autoFixed` flag from create_ticket tool output
