# Worklog: Prevent PM agent from creating/updating tickets with unresolved placeholders (0066)

## Implementation steps

1. **Added placeholder validation to create_ticket tool**
   - Added validation check before database operations using PLACEHOLDER_RE pattern
   - Returns error with detectedPlaceholders array when validation fails
   - Re-validates after normalizeTitleLineInBody to catch any placeholders introduced by normalization
   - Updated CreateResult type to include detectedPlaceholders in error case

2. **Added placeholder validation to update_ticket_body tool**
   - Same validation logic as create_ticket
   - Validates before database update operation
   - Re-validates after normalization
   - Updated UpdateResult type to include detectedPlaceholders in error case

3. **Added Diagnostics UI section for ticket readiness evaluation**
   - Added new "Ticket readiness evaluation" section in Diagnostics panel
   - Extracts readiness info from create_ticket or update_ticket_body tool calls
   - Shows REJECTED status with detected placeholders when validation fails
   - Shows PASS/FAIL status with missing items when operation succeeds but ticket not ready

4. **Updated fallback reply logic**
   - Added handling for placeholder validation failures in create_ticket and update_ticket_body
   - Shows clear error message with detected placeholders when validation fails
   - Directs user to Diagnostics for details
