# Plan: 0010 - HAL chat: hide until project attached + persist conversations

- Gate the chat UI behind `connectedProject` so users can’t interact with agents until a project folder is attached.
- Add minimal per-project persistence for `conversations` using `localStorage`, keyed by connected project identifier (folder name).
- Serialize/deserialize message timestamps and keep message IDs stable across reloads (avoid collisions).
- Surface persistence failures in the existing in-app Diagnostics panel (no console needed).
- Update CSS for a simple “connect a project” placeholder state and disabled agent selector styling.

# Plan: 0010 - HAL chat: hide until project attached + persist conversations

## Goal

Only show the HAL chat UI after a project is attached, and persist the conversation history so multi-turn PM conversations survive reloads.

## Analysis

### Current State
- `App.tsx` manages chat state with `conversations` (Record<ChatTarget, Message[]>)
- `connectedProject` tracks if a project folder is connected (stores folder name)
- Chat UI is always visible regardless of project connection status
- Conversation history is lost on page refresh

### Required Changes

1. **Gate chat UI**: Hide chat transcript/composer when no project connected; show placeholder
2. **Persist conversations**: Save to localStorage keyed by project identifier
3. **Restore on connect/load**: Load saved conversations when a project connects
4. **Scope per project**: Different projects should have separate conversation histories
5. **Error handling**: Track persistence errors and show in diagnostics

## Implementation Steps

### Step 1: Add localStorage helpers
- Create `CONVERSATION_STORAGE_KEY_PREFIX` constant
- Create `getStorageKey(projectName: string)` helper
- Create `saveConversations(projectName: string, conversations: Record<ChatTarget, Message[]>)` helper
- Create `loadConversations(projectName: string): Record<ChatTarget, Message[]> | null` helper

### Step 2: Add persistence error state
- Add `persistenceError: string | null` state
- Add to `DiagnosticsInfo` type and diagnostics panel display

### Step 3: Modify connection/disconnection handlers
- On connect: load saved conversations from localStorage for that project
- On disconnect: optionally save current conversations before clearing
- Clear conversations state when disconnecting

### Step 4: Persist on conversation changes
- Add useEffect to save conversations to localStorage whenever they change (and project is connected)

### Step 5: Gate chat UI
- When `connectedProject` is null, show placeholder instead of chat transcript/composer
- Keep chat header with agent selector visible but disabled
- Show clear message: "Connect a project to enable chat"

### Step 6: Handle serialization
- Messages have `Date` objects for timestamps - need to serialize/deserialize properly
- Use ISO string format for storage, parse back to Date on load

## Files to Change

- `src/App.tsx`: All changes confined to this file

## Testing Approach

1. Load HAL - verify chat is hidden/placeholder shown
2. Connect project folder - verify chat appears
3. Send 2+ messages, refresh page - verify messages persist
4. Disconnect, connect different project - verify different (empty) conversation
5. Reconnect original project - verify original conversation restored
6. Check diagnostics for any persistence errors
