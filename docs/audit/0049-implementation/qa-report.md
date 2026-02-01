# QA Report: 0049 - Update Ticket Template and PM Create Ticket Title Prefix

**Verified on:** `main` (implementation was merged to main for QA access)

## Ticket & Deliverable

**Goal:** Ensure all newly created tickets have a Title that begins with the 4-digit ticket ID (e.g., "0049 — Update …"), by updating the ticket template and the PM ticket creation path.

**Deliverable:** When the PM agent creates a new ticket from chat, the resulting ticket card/title shown in the kanban UI visibly starts with the ticket ID (e.g. "0050 — My new ticket"), and the synced markdown file in `docs/tickets/` shows the same prefixed Title line.

**Acceptance Criteria:**
- [x] Creating a ticket via the PM agent results in a Title line formatted as "NNNN — Example ticket title" (for example: "0050 — Add draggable splitter").
- [x] The ticket list/kanban card displays the prefixed Title consistently.
- [x] `docs/templates/ticket.template.md` demonstrates the "NNNN —" title prefix convention.
- [x] Agent-facing ticket-writing guidance used during ticket creation is updated so this convention is required.

## Audit Artifacts

All required audit files are present:
- ✅ `plan.md` - Implementation approach documented
- ✅ `worklog.md` - Timestamped implementation notes
- ✅ `changed-files.md` - Files modified listed
- ✅ `decisions.md` - Trade-offs documented (em dash vs regular dash)
- ✅ `verification.md` - Code review and UI verification steps
- ✅ `pm-review.md` - PM review with likelihood of success (95%)

## Code Review

### PASS ✅

| Requirement | Implementation | Evidence |
|------------|----------------|----------|
| Title formatted as "NNNN — Title" | ✅ Implemented | `projectManager.ts:543`: `const titleWithId = \`${id} — ${input.title.trim()}\`` (em dash) |
| Title stored in Supabase | ✅ Implemented | `projectManager.ts:549`: `title: titleWithId` inserted into Supabase |
| Template shows format | ✅ Implemented | `ticket.template.md:8`: Shows `- **Title**: `<task-id> — <short title>` (ID prefix is automatically enforced; do not include manually)` |
| System instructions updated | ✅ Implemented | `projectManager.ts:322`: Mentions "NNNN —" format in PM_SYSTEM_INSTRUCTIONS |
| Tool description updated | ✅ Implemented | `projectManager.ts:494`: Tool description mentions "automatically prefixes the title with 'NNNN —' format (e.g. '0050 — Your Title')" |
| Parameter description updated | ✅ Implemented | `projectManager.ts:496`: Parameter description clarifies "without ID prefix; the tool automatically formats it as 'NNNN — Your Title'" |

**Code Changes Verified:**
- `projects/hal-agents/src/agents/projectManager.ts:543`: Changed from regular dash to em dash (`—`) in title formatting
- `projects/hal-agents/src/agents/projectManager.ts:322`: System instructions updated to mention "NNNN —" format
- `projects/hal-agents/src/agents/projectManager.ts:494`: Tool description updated to mention automatic prefixing
- `projects/hal-agents/src/agents/projectManager.ts:496`: Parameter description updated to clarify format
- `docs/templates/ticket.template.md:8`: Template updated to show "NNNN —" format example

**Note:** The code includes a `normalizeTitleLineInBody` function (line 545) that was added in ticket 0054. This is a separate enhancement and does not affect the 0049 implementation.

## UI Verification

**Automated checks:**
- ✅ TypeScript compilation: Code compiles without errors
- ✅ No lint errors in modified files

**Manual verification required:**
Since this is a code review on `main` (feature branch was merged), manual UI verification should be performed by the user in Human in the Loop:

1. **Create a new ticket via PM agent:**
   - In HAL app, connect project folder (with Supabase credentials in .env)
   - In PM chat, ask to "create a ticket for testing title format"
   - Verify the created ticket appears in Unassigned column
   - **Expected**: Ticket card title should start with "NNNN —" (e.g. "0050 — Testing title format")

2. **Check synced markdown file:**
   - Run `npm run sync-tickets` from repo root
   - Open `docs/tickets/NNNN-testing-title-format.md`
   - **Expected**: The Title line should show "NNNN — Testing title format"

3. **Verify template format:**
   - Open `docs/templates/ticket.template.md`
   - **Expected**: Title field shows "NNNN — <short title>" format

## Verdict

**PASS ✅ — Implementation complete, OK to move to Human in the Loop**

**Summary:**
- All acceptance criteria met through code review
- Title formatting uses em dash (`—`) as specified
- Template demonstrates the format convention
- System instructions and tool descriptions updated to enforce the convention
- Code changes are minimal and focused on the requirement
- No blocking issues identified

**Next steps:**
- Move ticket to Human in the Loop for user verification
- User should test ticket creation via PM agent to confirm UI displays prefixed titles correctly
