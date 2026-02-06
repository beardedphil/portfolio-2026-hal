# PM Review: Chat Preview Stack (0087)

## Summary (1–3 bullets)

- Replaced dropdown selector with Teams-style chat preview stack showing all available chats
- Added collapsible groups for QA and Implementation agents with expand/collapse functionality
- Implemented chat window that replaces Kanban iframe when a chat is opened, with close button and "Return to Kanban" link

## Likelihood of success

**Score (0–100%)**: 85%

**Why (bullets):**
- Implementation follows standard React patterns and reuses existing chat UI components
- State management is straightforward (openChatTarget tracks which chat is open)
- CSS styling follows existing design system patterns
- Potential issue: Chat window composer might need to ensure selectedChatTarget/selectedConversationId are synced correctly when sending messages

## What to verify (UI-only)

- Preview stack appears in right panel when project is connected
- Clicking a preview pane opens chat window in Kanban region (replacing iframe)
- X button and "Return to Kanban" link both close the chat and restore Kanban board
- Currently open chat preview pane is highlighted with purple border/background
- QA and Implementation groups expand/collapse correctly
- Empty states show "No QA agents running" / "No Implementation agents running" when groups are expanded with no instances

## Potential failures (ranked)

1. **Chat window composer doesn't send messages to correct chat** — Messages appear in wrong chat or fail to send. **Likely cause**: selectedChatTarget/selectedConversationId not synced when opening chat. **Diagnosis**: Check Diagnostics panel for selectedChatTarget value; verify messages appear in correct conversation.

2. **Preview stack doesn't update when new conversations are created** — New agent instances don't appear in preview stack. **Likely cause**: Preview stack not re-rendering when conversations Map updates. **Diagnosis**: Check if conversations are added to Map (React DevTools); verify preview stack re-renders.

3. **Chat window shows wrong conversation** — Opening a chat shows messages from different chat. **Likely cause**: activeMessages calculation using wrong selectedChatTarget/selectedConversationId. **Diagnosis**: Check Diagnostics panel for selectedChatTarget and selectedConversationId values; verify activeMessages matches expected conversation.

4. **Highlighting doesn't update when switching chats** — Multiple preview panes highlighted or none highlighted. **Likely cause**: openChatTarget state not updating correctly or CSS class not applied. **Diagnosis**: Check openChatTarget value in React DevTools; verify chat-preview-active class is applied to correct pane.

5. **Groups don't expand/collapse** — Clicking group header doesn't toggle expansion. **Likely cause**: Event handler not working or state not updating. **Diagnosis**: Check qaGroupExpanded/implGroupExpanded state values; verify click handlers are attached.

## Audit completeness check

- **Artifacts present**: plan / worklog / changed-files / decisions / verification / pm-review
- **Traceability gaps**:
  - None identified - all requirements are addressed in implementation and verification steps

## Follow-ups (optional)

- Consider adding keyboard shortcuts for opening/closing chats
- Consider adding unread message indicators on preview panes (beyond unread count badge)
