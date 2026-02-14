# Chat UI Staging Test Procedure

This document defines the standard staging procedure for testing chat UI changes before production deployment. All chat UI changes must be tested in a staging environment to ensure proper functionality across different scenarios.

## When Staging Is Required

**Staging testing is mandatory for:**

- **Ticket types:** Any ticket that modifies chat UI behavior, appearance, or functionality
- **File paths that trigger staging:**
  - `src/App.tsx` (main chat UI component)
  - Any file in `src/` that contains chat-related components, message handling, or conversation logic
  - Any file that modifies chat message rendering, streaming, scrolling, or overlay/modal behavior
  - Changes to chat-related API endpoints in `api/` that affect UI behavior
  - Changes to chat-related utilities or libraries that impact UI

**Owner/Trigger:**
- **Implementation agent:** Responsible for running staging tests during implementation and recording results in the verification artifact
- **QA agent:** Responsible for running staging tests during QA verification and recording results in the QA report artifact
- **Human-in-the-Loop:** May perform additional manual staging verification if needed

## How to Run Staging Tests

1. **Deploy to staging environment:**
   - Ensure the staging environment is accessible (typically a Vercel Preview deployment or similar)
   - Verify staging environment has the same configuration as production (Supabase, API keys, etc.)

2. **Access the staging URL:**
   - Open the staging deployment URL in a browser
   - Ensure you are authenticated (if authentication is required)

3. **Run the minimum test checklist** (see below)

4. **Record results** in the appropriate artifact (see "Where Results Are Recorded" below)

## Minimum Test Checklist for Chat UI Changes

The following checklist must be completed for all chat UI changes. Each item must be explicitly tested and marked as PASS or FAIL.

### 1. Message Send
- [ ] User can type a message in the chat input
- [ ] Message appears in the chat history immediately after sending
- [ ] Message is properly formatted (text, line breaks, special characters)
- [ ] Send button/action works correctly (click, Enter key, etc.)

### 2. Streaming/Updates
- [ ] Agent responses stream correctly (if applicable)
- [ ] Partial responses appear incrementally as they are generated
- [ ] Streaming completes without errors
- [ ] Final message is complete and properly formatted
- [ ] Multiple messages in sequence stream correctly

### 3. Scroll Behavior
- [ ] Chat automatically scrolls to bottom when new messages arrive
- [ ] Manual scroll position is maintained when appropriate (e.g., viewing older messages)
- [ ] Scroll behavior works correctly on different screen sizes
- [ ] Scroll behavior works correctly with long messages
- [ ] Scroll behavior works correctly with many messages in history

### 4. Overlays/Modals
- [ ] Any chat-related overlays or modals open correctly
- [ ] Overlays/modals close correctly (via close button, ESC key, or click outside)
- [ ] Overlays/modals do not interfere with chat functionality
- [ ] Overlays/modals are properly positioned and visible
- [ ] Z-index/layering is correct (overlays appear above chat content)

### 5. Reconnect/Resume
- [ ] Chat reconnects correctly after network interruption
- [ ] Message history is preserved after reconnection
- [ ] In-progress messages resume correctly after reconnection
- [ ] Connection status indicators (if any) work correctly
- [ ] Error handling for connection failures is appropriate

### 6. Additional Context-Specific Tests
- [ ] Test any new features or changes specific to the ticket
- [ ] Test any edge cases mentioned in the ticket
- [ ] Test any regression scenarios related to the changes

## Where Results Are Recorded

### Implementation Agent

**Artifact type:** Verification artifact (`artifactType: "verification"`)

**Title format:** `Verification for ticket <ticket-id>`

**Required heading format in artifact:**

```markdown
## Chat UI Staging Test Results

### Staging Environment
- **URL:** [staging deployment URL]
- **Date:** [date of testing]
- **Tester:** Implementation agent

### Test Results

[Minimum test checklist with PASS/FAIL for each item]

### Overall Result
- **PASS** / **FAIL**

### Notes
[Any additional observations, issues, or context]
```

### QA Agent

**Artifact type:** QA report artifact (`artifactType: "qa"`)

**Title format:** `QA report for ticket <ticket-id>`

**Required heading format in artifact:**

```markdown
## Chat UI Staging Test Results

### Staging Environment
- **URL:** [staging deployment URL]
- **Date:** [date of testing]
- **Tester:** QA agent

### Test Results

[Minimum test checklist with PASS/FAIL for each item]

### Overall Result
- **PASS** / **FAIL**

### Notes
[Any additional observations, issues, or context]
```

### Human-in-the-Loop

If Human-in-the-Loop performs additional staging verification, results should be recorded in a comment or note on the ticket, or as a separate artifact if needed.

## Guardrail: Staging Environment Unavailable

**If staging cannot be run** (environment down, missing configuration, access issues, etc.):

1. **DO NOT silently proceed** — this is a failure condition
2. **Record the failure** in the appropriate artifact (verification artifact for implementation agent, QA report for QA agent)
3. **Include the following information:**
   - Reason staging could not be run (environment down, missing config, access denied, etc.)
   - Steps taken to attempt staging (what was tried)
   - Next-step guidance (what needs to be fixed before staging can proceed)
4. **Mark the overall result as FAIL** with a clear explanation
5. **Do not proceed to production** until staging can be successfully completed

**Example failure recording:**

```markdown
## Chat UI Staging Test Results

### Staging Environment
- **Status:** UNAVAILABLE
- **Reason:** Staging environment is down (HTTP 503 error)
- **Date:** [date of attempt]
- **Tester:** Implementation agent

### Test Results

**STAGING TESTS NOT RUN** — Staging environment unavailable

### Overall Result
- **FAIL** — Staging tests could not be completed

### Next-Step Guidance
1. Verify staging environment is running
2. Check staging environment logs for errors
3. Ensure staging environment has required configuration (Supabase, API keys, etc.)
4. Retry staging tests once environment is available
5. Do not proceed to production until staging tests pass
```

## Pass/Fail Criteria

### PASS Criteria

- All items in the minimum test checklist are marked as **PASS**
- No critical issues or regressions are observed
- Staging environment is accessible and functioning correctly
- All test results are recorded in the appropriate artifact with the required heading format

### FAIL Criteria

- Any item in the minimum test checklist is marked as **FAIL**
- Critical issues or regressions are observed
- Staging environment is unavailable and cannot be accessed
- Test results are not recorded or are incomplete
- Required heading format is not followed in the artifact

## Integration with Workflow

- **Implementation agent:** Must complete staging tests and record results in the verification artifact before moving the ticket to "Ready for QA"
- **QA agent:** Must complete staging tests and record results in the QA report artifact before approving the ticket
- **Human-in-the-Loop:** May perform additional verification but is not required to run staging tests if implementation and QA have both passed

## Notes

- Staging tests should be performed on a deployment that closely matches the production environment
- If automated UI tests exist for chat functionality, they should be run in addition to (not instead of) manual staging tests
- Staging test results are a required part of the verification/QA process for chat UI changes
- This procedure applies to all chat UI changes, regardless of size or scope
