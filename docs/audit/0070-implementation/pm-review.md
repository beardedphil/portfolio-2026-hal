# PM Review: 0070 - Scalable chat UI with multiple conversation instances per agent role

## Summary

- Updated chat UI to support multiple concurrent conversations per agent role (Implementation and QA)
- Added conversation card list UI showing agent role labels and message previews
- Implemented modal component for viewing full conversation threads
- Updated Kanban column header buttons to create new conversation instances instead of reusing existing ones

## Likelihood of success

**Score (0–100%)**: 85%

**Why (bullets):**
- Core functionality is implemented: data structure updated, UI components created, handlers updated
- Backward compatibility maintained for PM and Standup (single conversation)
- Persistence logic updated to handle new structure
- Some edge cases may need testing (e.g., rapid button clicks, very long message previews)

## What to verify (UI-only)

- **Critical path**: Click "Implement top ticket" button → modal opens with "Implementation #1" → close modal → see card in list → click button again → modal opens with "Implementation #2"
- **Message preview**: Send message in modal → close modal → verify card preview shows message text
- **Persistence**: Create multiple conversations → refresh page → verify all conversations persist
- **PM backward compatibility**: Select PM from dropdown → verify regular chat UI (not cards/modal)

## Potential failures (ranked)

1. **Modal doesn't open on work button click** — Button click doesn't show modal, or shows wrong conversation — Likely cause: `HAL_OPEN_CHAT_AND_SEND` handler not creating conversation or modal state not updating — In-app check: Check browser console for errors, verify `selectedConversationId` and `conversationModalOpen` state in React DevTools
2. **Card preview doesn't update after sending message** — Card shows old preview text after sending new message — Likely cause: `getConversationPreview` not re-running or conversation not updating — In-app check: Verify conversation's messages array is updated (React DevTools), check if card re-renders
3. **New instance not created on button click** — Clicking work button reuses existing conversation instead of creating new one — Likely cause: `getOrCreateConversation` logic issue or instance number calculation — In-app check: Verify `getNextInstanceNumber` returns correct value, check conversation IDs in state
4. **Conversations don't persist across refresh** — Conversations disappear after page refresh — Likely cause: localStorage serialization/deserialization issue or Supabase loading not working — In-app check: Check localStorage for conversation data, verify Supabase query returns data
5. **PM/Standup broken** — PM or Standup chat doesn't work (shows cards/modal instead of regular UI) — Likely cause: Conditional rendering logic issue — In-app check: Verify `selectedChatTarget` is correct, check if conversation list is shown for PM/Standup

## Audit completeness check

- **Artifacts present**: plan / worklog / changed-files / decisions / verification / pm-review
- **Traceability gaps**:
  - None identified

## Follow-ups (optional)

- Consider adding conversation deletion functionality
- Consider adding conversation search/filter
- Consider adding conversation timestamps in card list
