# Verification: Prevent PM agent from creating/updating tickets with unresolved placeholders (0066)

## UI-only verification steps

### Test 1: Create ticket with unresolved placeholders (should be rejected)

1. Open HAL app at http://localhost:5173
2. Select "Project Manager" chat
3. Ask PM to create a ticket with body containing unresolved placeholders (e.g., `<AC 1>`, `<task-id>`)
4. **Expected**: 
   - Chat shows error message: "Ticket creation rejected: unresolved template placeholder tokens detected"
   - Error message lists detected placeholders
   - Diagnostics > Ticket readiness evaluation shows REJECTED status with detected placeholders
   - No ticket appears in Kanban board

### Test 2: Update ticket with unresolved placeholders (should be rejected)

1. Create a valid ticket first (or use existing ticket)
2. Ask PM to update the ticket body with unresolved placeholders
3. **Expected**:
   - Chat shows error message: "Ticket update rejected: unresolved template placeholder tokens detected"
   - Error message lists detected placeholders
   - Diagnostics > Ticket readiness evaluation shows REJECTED status
   - Ticket body in Kanban board is unchanged

### Test 3: Create ticket without placeholders (should succeed)

1. Ask PM to create a ticket with complete, concrete content (no angle brackets)
2. **Expected**:
   - Ticket appears in Kanban board under Unassigned
   - Diagnostics > Ticket readiness evaluation shows PASS or FAIL with missing items (if not fully ready)
   - Chat shows success message with ticket ID

### Test 4: Update ticket without placeholders (should succeed)

1. Update an existing ticket with complete, concrete content
2. **Expected**:
   - Ticket body updates in Kanban board
   - Diagnostics > Ticket readiness evaluation shows PASS or FAIL with missing items
   - Chat shows success message

### Test 5: Diagnostics panel shows readiness evaluation

1. After any create_ticket or update_ticket_body operation, open Diagnostics panel
2. Scroll to "Ticket readiness evaluation" section
3. **Expected**:
   - Section shows status (REJECTED, PASS, or FAIL)
   - If REJECTED: shows detected placeholders and error message
   - If PASS: shows "PASS" status
   - If FAIL: shows "FAIL" status with missing items list

## Verification requirements

- All verification is UI-only (no terminal, devtools, or console required)
- Diagnostics panel is accessible via "Diagnostics" toggle at bottom of chat region
- Kanban board shows ticket updates within ~10 seconds (poll interval)
