# Verification: 0070 - Scalable chat UI with multiple conversation instances per agent role

## Code review checklist

- [x] **Data structure updated**: `Map<string, Conversation>` replaces `Record<ChatTarget, Message[]>`
- [x] **Conversation ID generation**: `getConversationId` creates IDs in format `{agentRole}-{instanceNumber}`
- [x] **New instance creation**: `HAL_OPEN_CHAT_AND_SEND` creates new conversation for Implementation/QA agents
- [x] **Conversation cards UI**: Cards show agent role label and message preview
- [x] **Modal component**: Modal displays full conversation thread with transcript and composer
- [x] **Modal close behavior**: Closing modal returns to conversation list
- [x] **Message sending**: Sending from modal updates conversation and card preview
- [x] **Persistence**: Conversations saved to localStorage and loaded correctly
- [x] **Backward compatibility**: PM and Standup use default conversation (instance #1)
- [x] **CSS styles**: Cards and modal have proper styling with hover/focus states

## Automated checks

- [x] **TypeScript compilation**: No type errors
- [x] **Linter**: No linting errors
- [x] **Build**: Code compiles successfully

## Manual verification steps

### Requirement: Conversation cards list for Implementation agent

1. Connect a project folder
2. Select "Implementation Agent" from chat dropdown
3. **Verify**: Conversation list is shown (empty state if no conversations)
4. Click "Implement top ticket" button in Kanban To Do column header
5. **Verify**: Modal opens with new conversation "Implementation #1" and initial message present
6. Close modal
7. **Verify**: Returns to conversation list showing "Implementation #1" card with message preview
8. Click "Implement top ticket" button again
9. **Verify**: Modal opens with new conversation "Implementation #2" (not reusing #1)

### Requirement: Conversation cards list for QA agent

1. Select "QA" from chat dropdown
2. **Verify**: Conversation list is shown
3. Click "QA top ticket" button in Kanban QA column header
4. **Verify**: Modal opens with new conversation "QA #1" and initial message present
5. Close modal
6. **Verify**: Returns to conversation list showing "QA #1" card
7. Click "QA top ticket" button again
8. **Verify**: Modal opens with new conversation "QA #2" (not reusing #1)

### Requirement: Conversation card preview

1. Open a conversation in modal
2. Send a message: "Test message for preview"
3. Close modal
4. **Verify**: Card preview shows "Test message for preview" (or first line if longer)

### Requirement: Modal conversation thread

1. Open a conversation in modal
2. **Verify**: Full conversation thread is visible with all messages
3. Send a new message from modal
4. **Verify**: Message appears in thread immediately
5. Close modal and reopen same conversation
6. **Verify**: New message is still present in thread

### Requirement: PM and Standup backward compatibility

1. Select "Project Manager" from chat dropdown
2. **Verify**: Regular chat UI is shown (not conversation cards)
3. Send a message
4. **Verify**: Message appears in chat transcript (not in modal)
5. Select "Standup (all agents)" from chat dropdown
6. **Verify**: Regular chat UI is shown (not conversation cards)

### Requirement: Conversation persistence

1. Create multiple Implementation conversations (click work button multiple times)
2. Send messages in each conversation
3. Refresh the page
4. **Verify**: All conversations persist and are visible in conversation list
5. **Verify**: Card previews show latest messages correctly
