# QA Report: Prevent placeholder leakage in PM ticket creation (0066)

**Verified on:** `main` branch (implementation was merged to main for QA access)

## Ticket & deliverable

- **Goal:** Prevent the PM agent and PM ticket tools from creating or updating tickets that contain unresolved template placeholder tokens, and make such failures visible in-app.
- **Deliverable:** When the user asks the Project Manager to create a ticket, the resulting ticket shows up in the Kanban board with complete, concrete text (no unresolved template tokens), and the HAL Diagnostics UI shows a "ticket readiness" result for the ticket (pass/fail with specific reasons if it fails).
- **Acceptance criteria:**
  1. Creating a new ticket via PM chat results in a ticket body with no unresolved template placeholder tokens (for example: any text enclosed in angle brackets).
  2. If ticket creation or update would result in a body containing unresolved template placeholder tokens, the app shows an in-app error/diagnostic explaining the exact strings that were detected and that the action was rejected.
  3. The Diagnostics panel records the readiness evaluation outcome for each create_ticket / update_ticket_body call (pass/fail + missing items), without requiring devtools console.

## Audit artifacts

All required audit files are present:
- ✅ `plan.md` — Implementation approach and file touchpoints
- ✅ `worklog.md` — Timestamped implementation steps
- ✅ `changed-files.md` — List of modified files
- ✅ `decisions.md` — Trade-offs and rationale
- ✅ `verification.md` — UI-only verification steps
- ✅ `pm-review.md` — Likelihood of success (95%) and potential failures
- ✅ `qa-report.md` — This file

## Code review

### Acceptance Criteria 1: Validation prevents placeholder tokens in created tickets

**Status:** ✅ **PASS**

**Evidence:**
- `projects/hal-agents/src/agents/projectManager.ts` lines 523-534: Validation occurs **before** database operations using `PLACEHOLDER_RE` pattern (`/<[A-Za-z0-9\s\-_]+>/g`)
- Lines 565-575: Re-validation after `normalizeTitleLineInBody` to catch any placeholders introduced by normalization
- Returns error with `detectedPlaceholders` array when validation fails
- Database insert only occurs if validation passes (line 576)

**File references:**
- `projects/hal-agents/src/agents/projectManager.ts:523-534` (create_ticket validation)
- `projects/hal-agents/src/agents/projectManager.ts:565-575` (create_ticket re-validation)
- `projects/hal-agents/src/agents/projectManager.ts:714-726` (update_ticket_body validation)
- `projects/hal-agents/src/agents/projectManager.ts:746-756` (update_ticket_body re-validation)

### Acceptance Criteria 2: In-app error/diagnostic shows detected placeholders

**Status:** ✅ **PASS**

**Evidence:**
- **Chat error messages:** `projectManager.ts` lines 1136-1173 handle placeholder validation failures in fallback reply logic
  - Shows error message: "Ticket creation rejected: unresolved template placeholder tokens detected"
  - Lists detected placeholders in the chat message
  - Directs user to Diagnostics for details
- **Diagnostics UI:** `src/App.tsx` lines 2383-2403 display REJECTED status with:
  - Status: "REJECTED" (styled as error)
  - Reason: "Unresolved template placeholder tokens detected"
  - Detected placeholders list (formatted as code)
  - Full error message from tool output

**File references:**
- `projects/hal-agents/src/agents/projectManager.ts:1136-1154` (create_ticket rejection handling)
- `projects/hal-agents/src/agents/projectManager.ts:1156-1173` (update_ticket_body rejection handling)
- `src/App.tsx:2383-2403` (Diagnostics UI for rejected operations)

### Acceptance Criteria 3: Diagnostics panel records readiness evaluation

**Status:** ✅ **PASS**

**Evidence:**
- `src/App.tsx` lines 2366-2429: "Ticket readiness evaluation" Diagnostics section
- Extracts readiness info from `create_ticket` or `update_ticket_body` tool calls
- Shows three states:
  1. **REJECTED** (validation failed): Shows detected placeholders and error message
  2. **PASS** (operation succeeded, ticket ready): Shows "PASS" status
  3. **FAIL** (operation succeeded, ticket not ready): Shows "FAIL" status with missing items list
- Tool calls are extracted from API response and stored in `lastPmToolCalls` (line 892)
- Diagnostics UI reads from `diagnostics.lastPmToolCalls` (line 2366)
- No devtools console required — all information visible in-app

**File references:**
- `src/App.tsx:892` (tool calls extraction from API response)
- `src/App.tsx:2366-2429` (Diagnostics UI section)

### Implementation quality

**Status:** ✅ **PASS**

- Validation occurs at the correct point (before database operations)
- Defense in depth: re-validation after normalization
- Error messages are clear and actionable
- Diagnostics UI is well-integrated and shows all required information
- Code follows existing patterns and conventions

## UI verification

**Note:** Automated UI testing was not performed. Manual verification steps are documented in `verification.md`.

**Manual verification steps (from verification.md):**
1. Test 1: Create ticket with unresolved placeholders → should be rejected
2. Test 2: Update ticket with unresolved placeholders → should be rejected
3. Test 3: Create ticket without placeholders → should succeed
4. Test 4: Update ticket without placeholders → should succeed
5. Test 5: Diagnostics panel shows readiness evaluation

**Verification status:** Manual verification required by user in Human in the Loop phase.

## Verdict

**Implementation complete:** ✅ **YES**

**OK to merge:** ✅ **YES** (already merged to main)

**Blocking manual verification:** ⚠️ **YES** — User must verify in-app behavior matches acceptance criteria

### Summary

The implementation correctly:
- ✅ Validates for placeholder tokens before database operations
- ✅ Re-validates after normalization (defense in depth)
- ✅ Shows clear error messages in chat when validation fails
- ✅ Displays REJECTED/PASS/FAIL status in Diagnostics UI
- ✅ Lists detected placeholders or missing items as appropriate

All acceptance criteria are met based on code review. The implementation follows the plan and includes proper error handling and diagnostics. Manual UI verification is required to confirm the user experience matches the acceptance criteria.
