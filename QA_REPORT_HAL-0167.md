# QA Report: HAL-0167 - Process Review Agent Workflow

**Ticket ID**: HAL-0167  
**Repo**: beardedphil/portfolio-2026-hal  
**Date**: 2026-02-14  
**QA Status**: ❌ **FAILED** - Multiple acceptance criteria not met

## Executive Summary

The Process Review agent implementation is **incomplete** and does not meet the acceptance criteria. While the core Process Review functionality (analyzing artifacts and generating suggestions) works, the workflow automation requirements are not implemented:

- ❌ Process Review ticket does NOT move to Active Work when started
- ❌ Suggestions are NOT automatically converted to tickets
- ❌ Process Review ticket does NOT move to Done on completion
- ❌ No idempotency protection against duplicate ticket creation
- ✅ Suggestions are stored in structured format (JSON array)

## Detailed Findings

### ✅ Acceptance Criterion 1: Structured Format
**Status**: ✅ **PASS**

**Evidence**:
- `api/process-review/run.ts:248` - Suggestions are stored as JSON array with `text` and `justification` fields
- `api/process-review/run.ts:198-238` - Response parsing handles JSON format with fallback to bullet lists
- Database schema (`process_reviews.suggestions`) stores structured JSON

**Code Reference**:
```typescript
// api/process-review/run.ts:248
suggestions: suggestions,  // Array<{ text: string; justification: string }>
```

---

### ❌ Acceptance Criterion 2: Move to Active Work on Start
**Status**: ❌ **FAIL**

**Issue**: When Process Review button is clicked, the ticket remains in the Process Review column. It is NOT moved to Active Work (col-doing).

**Expected Behavior**: 
- Ticket should move from Process Review column to Active Work (col-doing) immediately when Process Review starts

**Actual Behavior**:
- Ticket stays in Process Review column
- Only status indicators are updated (UI shows "running" state)

**Code Analysis**:
- `src/App.tsx:2806-2887` - `handleKanbanProcessReview` function does NOT call `handleKanbanMoveTicket` to move ticket to `col-doing`
- Compare with QA agent: `src/App.tsx:2796` - QA agent DOES move ticket to `col-doing` when started
- Compare with Implementation agent: `src/App.tsx:2789` - Implementation agent DOES move ticket to `col-doing` when started

**Missing Code**:
```typescript
// Should be added in handleKanbanProcessReview, similar to QA/Implementation agents:
const doingCount = kanbanTickets.filter((t) => t.kanban_column_id === 'col-doing').length
await handleKanbanMoveTicket(data.ticketPk, 'col-doing', doingCount)
```

---

### ❌ Acceptance Criterion 3: Automatic Ticket Creation from Suggestions
**Status**: ❌ **FAIL**

**Issue**: Suggestions are NOT automatically converted to tickets. The system requires manual user interaction via a "Create ticket" button in the Kanban UI.

**Expected Behavior**:
- On Process Review completion, system should automatically create one ticket per suggestion
- All suggestion tickets should be placed in Unassigned column
- No user interaction required

**Actual Behavior**:
- Suggestions are displayed in Kanban UI with checkboxes
- User must manually select suggestions and click "Create ticket" button
- Only ONE ticket is created (containing ALL selected suggestions), not one per suggestion

**Code Analysis**:
- `src/App.tsx:2859-2869` - On completion, only displays suggestions in chat, does NOT create tickets
- `projects/kanban/src/App.tsx:1116-1178` - `handleCreateTicket` requires manual user selection
- `api/tickets/create.ts:85` - Accepts array of suggestions but creates ONE ticket with all suggestions

**Missing Code**:
```typescript
// Should be added in handleKanbanProcessReview after successful completion:
if (result.suggestions && result.suggestions.length > 0) {
  // Create one ticket per suggestion
  for (const suggestion of result.suggestions) {
    await createTicketFromSuggestion(suggestion, ticketPk, ticketId)
  }
}
```

---

### ❌ Acceptance Criterion 4: One Ticket Per Suggestion
**Status**: ❌ **FAIL**

**Issue**: The ticket creation API creates ONE ticket containing ALL suggestions, not one ticket per suggestion.

**Expected Behavior**:
- Each suggestion should become its own separate ticket
- Each ticket should have complete structure (Goal, Human-verifiable deliverable, Acceptance criteria, Constraints, Non-goals)

**Actual Behavior**:
- `api/tickets/create.ts:85` - Accepts `suggestions: string[]` array
- `api/tickets/create.ts:153` - Combines all suggestions into one ticket body
- `api/tickets/create.ts:194` - Single ticket created with all suggestions listed

**Code Reference**:
```typescript
// api/tickets/create.ts:153-194
const suggestionsText = suggestions.map((s, i) => `- ${s}`).join('\n')
// ... creates ONE ticket with all suggestions
```

**Required Change**:
- API should accept single suggestion and create one ticket
- Caller should loop through suggestions and create one ticket per suggestion

---

### ❌ Acceptance Criterion 5: Idempotency
**Status**: ❌ **FAIL**

**Issue**: No protection against duplicate ticket creation if Process Review completion handler is triggered multiple times.

**Expected Behavior**:
- System should track which suggestions have already been converted to tickets (e.g., by run_id or suggestion hash)
- Duplicate creation attempts should be ignored

**Actual Behavior**:
- No tracking mechanism exists
- No check for existing tickets created from same Process Review run
- Multiple triggers would create duplicate tickets

**Missing Implementation**:
- Need to store `review_id` or `run_id` when creating suggestion tickets
- Need to check for existing tickets before creating new ones
- Could use suggestion text hash or review_id + suggestion index as unique identifier

**Suggested Approach**:
```typescript
// Store review_id in ticket metadata or linkage section
// Check for existing tickets with same review_id + suggestion_hash before creating
```

---

### ❌ Acceptance Criterion 6: Error Handling
**Status**: ⚠️ **PARTIAL** (Not applicable until automatic creation is implemented)

**Issue**: Error handling for ticket creation exists in manual flow, but automatic flow doesn't exist yet.

**Current State**:
- Manual ticket creation (`projects/kanban/src/App.tsx:1116-1178`) has error handling
- Process Review ticket shows error state if review fails (`src/App.tsx:2850-2856`)
- But automatic ticket creation doesn't exist, so this criterion can't be fully evaluated

**Required When Implemented**:
- If ticket creation fails for any suggestion, Process Review ticket should remain visible with error state
- Error message should describe which suggestion(s) failed
- No blank/partial tickets should be created
- User should be able to retry

---

### ❌ Acceptance Criterion 7: Move to Done on Completion
**Status**: ❌ **FAIL**

**Issue**: Process Review ticket does NOT move to Done column when Process Review completes successfully.

**Expected Behavior**:
- After Process Review completes and suggestion tickets are created, the Process Review ticket should move to Done column

**Actual Behavior**:
- Ticket remains in Process Review column after completion
- Only status indicators change (UI shows "completed" state)

**Code Analysis**:
- `src/App.tsx:2859-2876` - On completion, only updates status, does NOT move ticket
- Compare with other agents: Implementation agent moves ticket to QA on completion
- No call to `handleKanbanMoveTicket(data.ticketPk, 'col-done', ...)`

**Missing Code**:
```typescript
// Should be added in handleKanbanProcessReview after successful ticket creation:
await handleKanbanMoveTicket(data.ticketPk, 'col-done', doneCount)
```

---

## Code Review Summary

### Files Reviewed
1. `api/process-review/run.ts` - Process Review execution logic ✅
2. `api/tickets/create.ts` - Ticket creation API (creates one ticket with all suggestions) ❌
3. `src/App.tsx:2806-2887` - Process Review handler (missing move to Active Work, missing auto-creation, missing move to Done) ❌
4. `projects/kanban/src/App.tsx:1012-1263` - Process Review UI section (manual ticket creation only) ❌

### Implementation Gaps

1. **Missing: Move to Active Work**
   - Location: `src/App.tsx:2806` - `handleKanbanProcessReview`
   - Fix: Add ticket move to `col-doing` at start of Process Review

2. **Missing: Automatic Ticket Creation**
   - Location: `src/App.tsx:2859` - After Process Review completion
   - Fix: Add loop to create one ticket per suggestion automatically

3. **Missing: One Ticket Per Suggestion**
   - Location: `api/tickets/create.ts` - Currently accepts array, creates one ticket
   - Fix: Refactor to accept single suggestion, caller loops through suggestions

4. **Missing: Move to Done**
   - Location: `src/App.tsx:2859` - After ticket creation completes
   - Fix: Add ticket move to `col-done` after successful completion

5. **Missing: Idempotency**
   - Location: Multiple - Need tracking mechanism
   - Fix: Store review_id in ticket linkage, check for existing tickets before creating

---

## Test Scenarios

### Scenario 1: Process Review Workflow (Expected vs Actual)

**Expected Flow**:
1. User clicks Process Review button on ticket in Process Review column
2. ✅ Ticket moves to Active Work immediately
3. ✅ Process Review runs and generates suggestions
4. ✅ System automatically creates one ticket per suggestion in Unassigned
5. ✅ Process Review ticket moves to Done

**Actual Flow**:
1. User clicks Process Review button on ticket in Process Review column
2. ❌ Ticket stays in Process Review column
3. ✅ Process Review runs and generates suggestions
4. ❌ Suggestions displayed, but no automatic ticket creation
5. ❌ Process Review ticket stays in Process Review column

### Scenario 2: Duplicate Prevention (Not Implemented)

**Test**: Trigger Process Review completion handler twice
**Expected**: Second trigger should not create duplicate tickets
**Actual**: No protection exists, would create duplicates

### Scenario 3: Error Handling (Partial)

**Test**: Process Review completes but ticket creation fails
**Expected**: Process Review ticket shows error, remains visible, no partial tickets
**Actual**: Manual flow has error handling, but automatic flow doesn't exist

---

## Recommendations

### Priority 1: Critical Fixes (Required for Acceptance)

1. **Move to Active Work on Start**
   - Add `handleKanbanMoveTicket(data.ticketPk, 'col-doing', doingCount)` at start of Process Review
   - Reference: `src/App.tsx:2789` (Implementation agent pattern)

2. **Automatic Ticket Creation**
   - After Process Review completion, loop through suggestions and create tickets
   - Create one ticket per suggestion (not one ticket with all suggestions)

3. **Move to Done on Completion**
   - After all suggestion tickets are created, move Process Review ticket to Done
   - Add `handleKanbanMoveTicket(data.ticketPk, 'col-done', doneCount)`

### Priority 2: Important Fixes (Required for Production)

4. **Idempotency**
   - Store `review_id` in ticket linkage/metadata
   - Before creating ticket, check if ticket with same `review_id` + suggestion hash already exists
   - Skip creation if duplicate found

5. **Error Handling**
   - Wrap ticket creation in try-catch
   - If any ticket creation fails, show error on Process Review ticket
   - Don't create partial tickets (all-or-nothing, or track which succeeded)

### Priority 3: Enhancements (Nice to Have)

6. **Ticket Content Structure**
   - Ensure each suggestion ticket has complete structure:
     - Goal (derived from suggestion)
     - Human-verifiable deliverable
     - Acceptance criteria with checkboxes
     - Constraints
     - Non-goals
   - Current implementation in `api/tickets/create.ts:156-199` has good structure, but needs to be called per suggestion

---

## Conclusion

The Process Review agent implementation is **incomplete** and does not meet the acceptance criteria. The core functionality (analyzing artifacts and generating suggestions) works correctly, but the workflow automation is missing:

- ❌ No automatic move to Active Work
- ❌ No automatic ticket creation
- ❌ No move to Done on completion
- ❌ No idempotency protection

**Recommendation**: **DO NOT MERGE** until all Priority 1 fixes are implemented and tested.

---

## Next Steps

1. Implement Priority 1 fixes (move to Active Work, automatic ticket creation, move to Done)
2. Implement Priority 2 fixes (idempotency, error handling)
3. Test complete workflow end-to-end
4. Re-run QA review

---

**QA Reviewer**: Auto (AI Agent)  
**Review Date**: 2026-02-14
