# Verification: 0097 - Preserve chats across disconnect/reconnect

## Code Review

- [x] `loadConversationsFromStorage()` function exists and deserializes conversations correctly
- [x] `handleSelectGithubRepo` loads conversations from localStorage before Supabase
- [x] `handleSelectGithubRepo` restores agent status from localStorage
- [x] `handleDisconnect` does not remove localStorage items
- [x] `handleDisconnect` does not set agent status to 'idle'
- [x] Conversations are merged correctly (Supabase PM takes precedence)

## UI Verification Steps

### Test Case 1: Basic disconnect/reconnect with multiple agent chats

1. **Setup**: Connect to a GitHub repo
2. **Create conversations**:
   - Send a message to Project Manager chat
   - Start an Implementation Agent conversation (e.g., "Implement ticket 0001")
   - Start a QA Agent conversation (e.g., "QA ticket 0001")
3. **Verify**: All three chat previews are visible in the chat preview stack
4. **Disconnect**: Click "Disconnect" button
5. **Verify**: Chat previews disappear (placeholder shown)
6. **Reconnect**: Connect to the same repo
7. **Verify**: All three chat previews are visible again
8. **Open chats**: Click each chat preview
9. **Verify**: Each chat shows the existing conversation history (not empty/new)

### Test Case 2: Agent status boxes persist

1. **Setup**: Connect to a repo and start an Implementation Agent run
2. **Verify**: Implementation Agent status box is visible at bottom of chat pane
3. **Disconnect**: Click "Disconnect"
4. **Verify**: Status box disappears (because `connectedProject` is null)
5. **Reconnect**: Connect to the same repo
6. **Verify**: Implementation Agent status box returns and shows the same status as before disconnect

### Test Case 3: No duplicate chat threads

1. **Setup**: Connect to a repo with existing Implementation Agent chat
2. **Verify**: One Implementation Agent chat preview is visible
3. **Disconnect**: Click "Disconnect"
4. **Reconnect**: Connect to the same repo
5. **Verify**: Still only one Implementation Agent chat preview (no duplicates)

### Test Case 4: PM conversations from Supabase take precedence

1. **Setup**: Connect to a repo, send PM messages (saved to Supabase)
2. **Disconnect**: Click "Disconnect"
3. **Reconnect**: Connect to the same repo
4. **Verify**: PM chat shows messages from Supabase (not stale localStorage data)

## Expected Behavior

- **Chat previews**: Remain visible after disconnect/reconnect
- **Conversation history**: Preserved in all agent chats
- **Agent status boxes**: Return after reconnect and match current states
- **No duplicates**: No duplicate chat threads created
- **PM conversations**: Supabase takes precedence over localStorage

## Failure Modes

- **Chats disappear**: Conversations not loaded from localStorage on reconnect
- **Empty chats**: Conversations loaded but messages not deserialized correctly
- **Status boxes missing**: Agent status not restored from localStorage
- **Duplicate chats**: Conversations merged incorrectly, creating duplicates
- **Stale PM data**: localStorage PM conversations used instead of Supabase
