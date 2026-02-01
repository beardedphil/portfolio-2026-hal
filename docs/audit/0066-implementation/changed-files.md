# Changed Files: Prevent PM agent from creating/updating tickets with unresolved placeholders (0066)

## Modified files

1. **projects/hal-agents/src/agents/projectManager.ts**
   - Added placeholder validation before create_ticket database operations
   - Added placeholder validation before update_ticket_body database operations
   - Updated CreateResult and UpdateResult types to include detectedPlaceholders
   - Updated fallback reply logic to handle placeholder validation failures

2. **src/App.tsx**
   - Added "Ticket readiness evaluation" Diagnostics section
   - Extracts and displays readiness evaluation from create_ticket/update_ticket_body tool calls
   - Shows rejection status with detected placeholders when validation fails
   - Shows pass/fail status with missing items when operation succeeds
