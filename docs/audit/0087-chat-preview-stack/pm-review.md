# PM Review: Chat Preview Stack (0087)

## Summary (1–3 bullets)

- Removed full chat UI from Chat pane, now shows only preview stack (Teams-style interface)
- Added agent status boxes at bottom of Chat pane showing working agents (disappear when done)
- Chat window (already implemented) replaces Kanban iframe when opened, with close button and "Return to Kanban" link

## Likelihood of success

**Score (0–100%)**: 90%

**Why (bullets):**
- Implementation follows standard React patterns and reuses existing chat UI components
- State management is straightforward (openChatTarget tracks which chat is open)
- CSS styling follows existing design system patterns
- Agent status boxes use existing status state (implAgentRunStatus, qaAgentRunStatus) - no new state needed
- Status filtering logic is simple (not idle, not completed)
- Potential issue: Status boxes might not update immediately if status changes occur rapidly

## What to verify (UI-only)

- Chat pane shows only preview stack (no embedded chat transcript/composer)
- Agent status boxes appear at bottom of Chat pane when agents are working
- Status boxes disappear when agents reach "Done" state
- Preview stack appears in right panel when project is connected
- Clicking a preview pane opens chat window in Kanban region (replacing iframe)
- X button and "Return to Kanban" link both close the chat and restore Kanban board
- Currently open chat preview pane is highlighted with purple border/background
- QA and Implementation groups expand/collapse correctly
- Empty states show "No QA agents running" / "No Implementation agents running" when groups are expanded with no instances

## Potential failures (ranked)

1. **Status boxes don't appear/disappear correctly** — Status boxes don't show when agents are working, or don't disappear when done. **Likely cause**: Status filtering logic incorrect (checking wrong status values) or status state not updating. **Diagnosis**: Check Diagnostics panel for implAgentRunStatus/qaAgentRunStatus values; verify status boxes render conditionally based on these values.

2. **Chat pane still shows full chat UI** — Embedded chat transcript/composer visible in Chat pane. **Likely cause**: Full chat UI not fully removed from Chat pane section. **Diagnosis**: Inspect Chat pane DOM; verify only preview stack and status boxes are visible (no chat-transcript or chat-composer elements).

3. **Status boxes positioned incorrectly** — Status boxes not at bottom of Chat pane. **Likely cause**: CSS flex layout not working correctly (missing margin-top: auto or flex-shrink: 0). **Diagnosis**: Check CSS for .agent-status-boxes; verify it has margin-top: auto and parent has flex layout.

4. **Chat window composer doesn't send messages to correct chat** — Messages appear in wrong chat or fail to send. **Likely cause**: selectedChatTarget/selectedConversationId not synced when opening chat. **Diagnosis**: Check Diagnostics panel for selectedChatTarget value; verify messages appear in correct conversation.

5. **Preview stack doesn't update when new conversations are created** — New agent instances don't appear in preview stack. **Likely cause**: Preview stack not re-rendering when conversations Map updates. **Diagnosis**: Check if conversations are added to Map (React DevTools); verify preview stack re-renders.

6. **Chat window shows wrong conversation** — Opening a chat shows messages from different chat. **Likely cause**: activeMessages calculation using wrong selectedChatTarget/selectedConversationId. **Diagnosis**: Check Diagnostics panel for selectedChatTarget and selectedConversationId values; verify activeMessages matches expected conversation.

7. **Highlighting doesn't update when switching chats** — Multiple preview panes highlighted or none highlighted. **Likely cause**: openChatTarget state not updating correctly or CSS class not applied. **Diagnosis**: Check openChatTarget value in React DevTools; verify chat-preview-active class is applied to correct pane.

## Audit completeness check

- **Artifacts present**: plan / worklog / changed-files / decisions / verification / pm-review
- **Traceability gaps**:
  - None identified - all requirements are addressed in implementation and verification steps

## Follow-ups (optional)

- Consider adding keyboard shortcuts for opening/closing chats
- Consider adding unread message indicators on preview panes (beyond unread count badge)
