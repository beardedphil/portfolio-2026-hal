# Plan: Prevent PM agent from creating/updating tickets with unresolved placeholders (0066)

## Approach

1. **Add validation BEFORE create_ticket operation**
   - Check for unresolved placeholder tokens (angle brackets) in body_md before any database operations
   - If placeholders detected, reject the operation and return error with detected placeholders list
   - Re-validate after normalization (normalizeTitleLineInBody) to ensure normalization doesn't introduce placeholders

2. **Add validation BEFORE update_ticket_body operation**
   - Same validation logic as create_ticket
   - Check before database update, reject if placeholders found

3. **Add Diagnostics UI section for ticket readiness evaluation**
   - Extract readiness info from create_ticket/update_ticket_body tool calls
   - Display pass/fail status with missing items or detected placeholders
   - Show rejection reason when validation fails

4. **Update error messages in chat**
   - Add fallback reply logic to show placeholder validation errors in chat when model returns no text
   - Include detected placeholders in error message

## File touchpoints

- `projects/hal-agents/src/agents/projectManager.ts`
  - Add placeholder validation in create_ticket tool (before insert)
  - Add placeholder validation in update_ticket_body tool (before update)
  - Update fallback reply logic to handle placeholder validation failures
- `src/App.tsx`
  - Add "Ticket readiness evaluation" Diagnostics section
  - Extract readiness info from tool calls and display pass/fail status
