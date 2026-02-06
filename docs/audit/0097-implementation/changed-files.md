# Changed files: 0097 - Preserve chats across disconnect/reconnect

## Modified

- `src/App.tsx`
  - Added `loadConversationsFromStorage()` function to restore conversations from localStorage
  - Modified `handleSelectGithubRepo` to:
    - Load conversations from localStorage first (all agents)
    - Restore agent status from localStorage (Implementation and QA)
    - Merge Supabase PM conversations with localStorage conversations (Supabase takes precedence for PM)
  - Modified `handleDisconnect` to:
    - NOT remove localStorage items (preserve conversations and agent status)
    - NOT set agent status to 'idle' (status boxes are gated by `connectedProject`)
    - Only clear ticket IDs and diagnostics (per-session state)
