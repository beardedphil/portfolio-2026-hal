# Changed files: 0010 - HAL chat: hide until project attached + persist conversations

## Modified

- `src/App.tsx`
  - Gate chat transcript/composer behind `connectedProject`
  - Add localStorage persistence for `conversations` (save on change, restore on connect, clear on disconnect)
  - Track and display `persistenceError` in Diagnostics
- `src/index.css`
  - Add styles for the “Connect a project to enable chat” placeholder
  - Add disabled styling for the agent selector

## Created

- `docs/audit/0010-hal-chat-hide-until-project-attached-and-persist-conversations/worklog.md`
- `docs/audit/0010-hal-chat-hide-until-project-attached-and-persist-conversations/verification.md`
- `docs/audit/0010-hal-chat-hide-until-project-attached-and-persist-conversations/pm-review.md`
- `docs/audit/0010-hal-chat-hide-until-project-attached-and-persist-conversations/plan.md`
- `docs/audit/0010-hal-chat-hide-until-project-attached-and-persist-conversations/changed-files.md`
- `docs/audit/0010-hal-chat-hide-until-project-attached-and-persist-conversations/decisions.md`

# Changed Files: 0010 - HAL chat: hide until project attached + persist conversations

## Files Modified

### `src/App.tsx`
- **Added types**: `SerializedMessage` for Date serialization
- **Added constants**: `CONVERSATION_STORAGE_PREFIX`
- **Added helpers**: 
  - `getStorageKey()` - generates localStorage key for project
  - `saveConversationsToStorage()` - saves conversations with Date serialization
  - `loadConversationsFromStorage()` - loads and deserializes conversations
  - `getEmptyConversations()` - returns empty conversation state
- **Added state**: `persistenceError` for tracking storage errors
- **Modified `DiagnosticsInfo`**: Added `persistenceError` field
- **Modified `handleConnectProjectFolder`**: Load saved conversations on connect
- **Modified `handleDisconnect`**: Clear conversations and reset state
- **Added useEffect**: Persist conversations on change when project connected
- **Modified chat UI**: Conditional rendering based on `connectedProject`
- **Modified diagnostics**: Added persistence error row

### `src/index.css`
- **Added**: `.chat-placeholder` styles (flex container for placeholder)
- **Added**: `.chat-placeholder-text` styles (main message)
- **Added**: `.chat-placeholder-hint` styles (secondary hint text)
- **Added**: `.agent-selector select:disabled` styles (disabled state)

## Files Created

### `docs/audit/0010-hal-chat-hide-until-project-attached-and-persist-conversations/`
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md`
- `pm-review.md`
