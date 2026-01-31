# Worklog: 0010 - HAL chat: hide until project attached + persist conversations

## Session 1 (2026-01-31)

### Analysis (5 min)
- Read ticket requirements: hide chat until project attached, persist conversations per project
- Analyzed current `App.tsx` implementation: found `connectedProject` state, `conversations` state, no persistence
- Identified key touchpoints: connection handlers, conversation state, chat UI rendering

### Implementation (15 min)

#### Added localStorage helpers
- Created `CONVERSATION_STORAGE_PREFIX` constant
- Created `getStorageKey()` helper function
- Created `SerializedMessage` type for Date serialization
- Created `saveConversationsToStorage()` function with error handling
- Created `loadConversationsFromStorage()` function with Date deserialization
- Created `getEmptyConversations()` helper

#### Added persistence state
- Added `persistenceError` state variable
- Added `persistenceError` to `DiagnosticsInfo` type

#### Modified connection handlers
- Updated `handleConnectProjectFolder`:
  - Load saved conversations from localStorage on connect
  - Restore messageIdRef to avoid ID collisions
  - Set persistence error if load fails
- Updated `handleDisconnect`:
  - Clear conversations state
  - Reset messageIdRef
  - Clear persistence error

#### Added persistence effect
- Added useEffect to save conversations to localStorage when they change
- Only saves when project is connected
- Updates persistence error state on failure

#### Gated chat UI
- Chat transcript and composer only render when project connected
- Added placeholder with message "Connect a project to enable chat"
- Disabled agent selector when no project connected

#### Added diagnostics
- Added persistence error row to diagnostics panel
- Shows error state with red styling when present

### CSS updates
- Added `.chat-placeholder` styles
- Added `.chat-placeholder-text` and `.chat-placeholder-hint` styles
- Added disabled state for agent selector

### Verification
- [x] TypeScript compiles without errors
- [x] No lint errors
- [x] `npm run build` succeeds
- [x] Chat placeholder shows when no project connected
- [x] Agent selector is disabled when no project connected
- [x] Diagnostics panel shows "Persistence error: none"
- [x] All acceptance criteria for "not connected" state verified in browser
