# Verification: 0083 - Auto-move Ready Tickets to To Do on Creation

## UI-Only Verification Steps

### 1. Create a Ready Ticket
- In HAL app, use PM chat to create a new ticket with all required sections filled (Goal, Human-verifiable deliverable, Acceptance criteria with checkboxes, Constraints, Non-goals, no placeholders)
- **Expected**: Ticket appears in **To Do** column (not Unassigned)
- **Expected**: PM chat shows message: "Created ticket **XXXX** at `...`. The ticket is ready and has been automatically moved to **To Do**."

### 2. Create a Not-Ready Ticket
- In HAL app, use PM chat to create a new ticket with missing sections or placeholders (e.g., missing Acceptance criteria checkboxes or contains `<placeholder>`)
- **Expected**: Ticket appears in **Unassigned** column
- **Expected**: PM chat shows message: "Created ticket **XXXX** at `...`. The ticket is not yet ready for To Do: [missing items]. It remains in Unassigned."

### 3. Verify Normalization
- Create a ticket with non-standard headings (e.g., `# Goal` instead of `## Goal (one sentence)`)
- **Expected**: Ticket is normalized and if ready, moved to To Do
- **Expected**: Ticket body in Supabase shows normalized headings

### 4. Verify Existing Tickets Unaffected
- Move an existing ticket manually from Unassigned to To Do using PM chat
- **Expected**: Manual move works as before
- **Expected**: Existing tickets in other columns remain unchanged

### 5. Verify Diagnostics
- Create a ticket and check Diagnostics > Tool Calls > create_ticket
- **Expected**: Output shows `movedToTodo: true` if ticket was moved
- **Expected**: Output shows `missingItems` array if ticket is not ready
- **Expected**: Output shows `ready: true/false` status

## Acceptance Criteria Verification

- [x] Creating a new ticket results in the ticket being placed in the **To Do** column automatically (if ready)
- [x] The created ticket's body is automatically normalized to the expected Ready-to-start section headings
- [x] If the ticket cannot be normalized to a Ready-to-start state, the UI clearly indicates what is missing and the ticket remains in Unassigned
- [x] The creation flow does not require the user to manually request "make ready" or "move to To Do" for standard tickets
- [x] Existing tickets and manual moves continue to work as they do today
