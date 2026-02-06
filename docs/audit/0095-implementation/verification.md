# Verification: 0095-implementation

## UI-only verification steps

### 1. Create a Ready Ticket (with auto-fix)
- In HAL app, use PM chat to create a new ticket with all required sections, but use bullets (`-`) instead of checkboxes (`- [ ]`) in Acceptance criteria
- **Expected**: 
  - PM chat shows message: "Created ticket **XXXX** at `...`. The ticket is **Ready-to-start** (formatting issues were automatically fixed) and has been automatically moved to **To Do**."
  - Ticket appears in **To Do** column (not Unassigned)
  - Ticket shows as Ready-to-start (no validation errors)

### 2. Create a Ready Ticket (no fixes needed)
- In HAL app, use PM chat to create a new ticket with all required sections properly formatted (including checkboxes in Acceptance criteria)
- **Expected**: 
  - PM chat shows message: "Created ticket **XXXX** at `...`. The ticket is **Ready-to-start** and has been automatically moved to **To Do**."
  - Ticket appears in **To Do** column
  - No mention of auto-fix (since none was needed)

### 3. Create a Not-Ready Ticket (missing content)
- In HAL app, use PM chat to create a new ticket with missing sections (e.g., no Goal section or empty Constraints)
- **Expected**: 
  - PM chat shows message: "Created ticket **XXXX** at `...`. The ticket is **not Ready-to-start**: [missing items]. It remains in Unassigned. Please update the ticket content to make it ready, then use 'Prepare top ticket' or ask me to move it to To Do."
  - Ticket appears in **Unassigned** column
  - Clear indication of what is missing

### 4. Prepare Top Ticket (becomes ready)
- In HAL app, ensure there is a ticket in **Unassigned** that has formatting issues (e.g., bullets instead of checkboxes) but all required sections exist
- Click **Prepare top ticket** button in Unassigned column header
- **Expected**: 
  - PM chat shows message indicating the ticket was prepared and moved to **To Do**
  - Ticket appears in **To Do** column (not Unassigned)
  - Ticket shows as Ready-to-start

### 5. Prepare Top Ticket (cannot be made ready)
- In HAL app, ensure there is a ticket in **Unassigned** that is missing required content (e.g., no Goal section)
- Click **Prepare top ticket** button in Unassigned column header
- **Expected**: 
  - PM chat shows message explaining what is missing and that the ticket remains in Unassigned
  - Ticket remains in **Unassigned** column
  - Clear guidance on what needs to be fixed

### 6. Error Handling - Move Failure
- Create a ticket that is ready but simulate a move failure (or check Diagnostics if move fails)
- **Expected**: 
  - PM chat shows message: "Created ticket **XXXX** at `...`. The ticket is **Ready-to-start** but could not be moved to To Do: [error]. It remains in Unassigned. Please try moving it manually or check the error details."
  - Clear indication of what failed and next steps

## Acceptance criteria verification

- [x] When a user creates a new ticket, the UI ends with the ticket located in the **To Do** column (if ready)
- [x] If the newly created ticket fails Ready-to-start validation, the system automatically updates/reformats the ticket content to pass (formatting issues only), and the UI then moves it to **To Do**
- [x] After ticket creation completes, the UI shows an explicit confirmation that the ticket is **Ready-to-start** and has been moved to **To Do**
- [x] Clicking **Prepare top ticket** on the top Unassigned ticket results in: (1) the ticket becoming Ready-to-start, and (2) the ticket being moved to **To Do** without requiring additional manual moves
- [x] If any step fails (validation, update, or move), the UI shows a clear error state describing what failed and what the user can do next
