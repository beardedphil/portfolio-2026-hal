# Peer Review / Definition of Ready Check

**Added in ticket 0180**

## Overview

The Peer Review feature provides a lightweight check that validates ticket formatting and Definition of Ready before a ticket is moved into the work queue. This prevents agents from starting on under-specified or malformed tickets.

## How to Use

### In the HAL UI

1. **From Ticket Detail View:**
   - Open any ticket in the **Unassigned** column
   - Scroll to the **Peer Review / DoR Check** section
   - Click **Run Review** to check the ticket

2. **Review Results:**
   - **PASS**: Ticket meets all Definition of Ready requirements and is eligible to be moved to **To Do**
   - **FAIL**: Ticket has issues that must be fixed before it can be moved to **To Do**
     - Click on any issue in the list to jump to that section in the ticket editor
     - Fix the issues and run the review again

### Integration with PM Automation

- The PM automation (`checkUnassignedTickets`) automatically uses peer review logic to evaluate tickets
- Tickets that **FAIL** peer review are **not** moved to **To Do** automatically
- Only tickets that **PASS** peer review are eligible for automatic movement to **To Do**

## What Gets Checked

The peer review validates:

1. **Required Sections:**
   - `## Goal (one sentence)` - Must be present and non-empty
   - `## Human-verifiable deliverable (UI-only)` - Must be present and non-empty
   - `## Acceptance criteria (UI-only)` - Must be present and use checkbox format (`- [ ]`)

2. **Formatting:**
   - Acceptance criteria must use checkbox format (`- [ ]`), not plain bullets (`-`)
   - Section headings must use `##` (H2), not `#` (H1) or `###` (H3)
   - No pseudo-headings (bold text or plain text with colons instead of markdown headings)

3. **Content Quality:**
   - No unresolved placeholders (e.g., `<AC 1>`, `<task-id>`)
   - Constraints and Non-goals sections are optional but recommended

## API Endpoint

The peer review can also be called programmatically:

```bash
POST /api/tickets/peer-review
Content-Type: application/json

{
  "ticketId": "0180",
  "ticketPk": "uuid-here",
  "bodyMd": "...",  // Optional: provide body directly
  "supabaseUrl": "...",  // Optional: for fetching ticket
  "supabaseAnonKey": "..."  // Optional: for fetching ticket
}
```

Response:
```json
{
  "success": true,
  "pass": false,
  "issues": [
    {
      "type": "missing-section",
      "message": "Missing or empty \"Goal\" section. Required heading: \"## Goal (one sentence)\"",
      "section": "Goal"
    }
  ],
  "checklistResults": {
    "goal": false,
    "deliverable": true,
    "acceptanceCriteria": false,
    "constraintsNonGoals": true,
    "noPlaceholders": true,
    "properHeadings": true
  }
}
```

## Related Documentation

- Definition of Ready checklist: See `docs/process/ready-to-start-checklist.md` (in HAL superrepo)
- Heading parsing pitfalls: See `.cursor/rules/heading-parsing-pitfalls.mdc`
