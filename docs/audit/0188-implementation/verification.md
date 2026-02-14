# Verification for ticket 0188

## UI-only verification steps

1. **Open the procedure document**:
   - Navigate to `docs/process/chat-ui-staging-test-procedure.mdc` in the repository
   - Verify the file exists and is readable

2. **Verify "Chat UI Staging Test Procedure" section exists**:
   - Look for the heading "# Chat UI Staging Test Procedure" at the top of the file
   - Verify it includes an Overview section explaining the purpose

3. **Verify "When Staging Is Required" section**:
   - Check that "## When Staging Is Required" section exists
   - Verify it lists:
     - Chat UI components and layout (with file paths)
     - Chat interaction flows
     - Chat UI features
     - File paths that trigger staging requirement (including `src/App.tsx`, `**/chat*.tsx`, etc.)
   - Verify it also lists what does NOT require staging

4. **Verify "How to Run Staging Tests" section**:
   - Check that "## How to Run Staging Tests" section exists
   - Verify it includes:
     - Prerequisites (staging environment, project connected, test data)
     - Running Tests steps (deploy, access, execute checklist, record results)

5. **Verify "Minimum Test Checklist" section**:
   - Check that "## Minimum Test Checklist" section exists
   - Verify it includes at least these items:
     - Message Send
     - Streaming/Updates
     - Scroll Behavior
     - Overlays/Modals
     - Reconnect/Resume
   - Verify each item has checkbox format (`- [ ]`) with specific test criteria

6. **Verify "Pass/Fail Criteria" section**:
   - Check that "## Pass/Fail Criteria" section exists
   - Verify it includes:
     - PASS criteria (what constitutes a pass)
     - FAIL criteria (what constitutes a fail)

7. **Verify "Recording Results" section**:
   - Check that "## Recording Results" section exists
   - Verify it specifies:
     - Where results are recorded for Implementation agents (Verification artifact)
     - Where results are recorded for QA agents (QA report artifact)
     - Where results are recorded for Human-in-the-Loop (ticket comments)
   - Verify it includes a "Required Heading Format" subsection with example

8. **Verify "Guardrails" section**:
   - Check that "## Guardrails" section exists
   - Verify it includes "If Staging Cannot Be Run" subsection
   - Verify it instructs agents to:
     - Record failure immediately
     - Document next-step guidance
     - NOT silently proceed
   - Verify it includes an example failure report

9. **Verify "Owner/Trigger" section**:
   - Check that "## Owner/Trigger: Who Runs Staging Tests" section exists
   - Verify it identifies:
     - Implementation Agents (responsibility, when, process)
     - QA Agents (responsibility, when, process)
     - Human-in-the-Loop (responsibility, when, process)
   - Verify it specifies which ticket types or file paths require staging

10. **Verify file is in correct location**:
    - Confirm file is in `docs/process/` directory
    - This location is accessible as "agent rules/process docs" per ticket requirement

## Expected results

- ✅ Procedure document exists at `docs/process/chat-ui-staging-test-procedure.mdc`
- ✅ All required sections are present and complete
- ✅ Minimum test checklist includes all mentioned areas (message send, streaming/updates, scroll behavior, overlays/modals, reconnect/resume)
- ✅ Recording results section specifies artifact types and includes required heading format
- ✅ Guardrails section includes instructions for when staging cannot be run
- ✅ Owner/Trigger section identifies responsibilities for each agent type and specifies file paths/ticket types
