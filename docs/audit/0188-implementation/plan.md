# Plan for ticket 0188

## Approach

1. **Verify existing procedure document**:
   - Check if `docs/process/chat-ui-staging-test-procedure.mdc` exists and is complete
   - Verify it meets all acceptance criteria from the ticket
   - Ensure it includes all required sections

2. **Verify acceptance criteria are met**:
   - ✅ New documented "Chat UI Staging Test Procedure" exists in agent rules/process docs
   - ✅ Includes: when staging is required, how to run it, and what constitutes a pass/fail
   - ✅ Includes explicit minimum test checklist for chat UI changes
   - ✅ Specifies where results are recorded and includes required heading format
   - ✅ Includes guardrail for when staging cannot be run
   - ✅ Identifies owner/trigger: which ticket types or file paths require staging and who is responsible

3. **Create audit artifacts**:
   - Create `docs/audit/0188-implementation/` directory
   - Create all required artifacts (plan, worklog, changed-files, decisions, verification, pm-review)

## File touchpoints

- `docs/process/chat-ui-staging-test-procedure.mdc` — Verify completeness and ensure it meets all acceptance criteria
