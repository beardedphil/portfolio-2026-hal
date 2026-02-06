# Decisions: 0097 - Preserve chats across disconnect/reconnect

## D1: Load conversations from localStorage on reconnect

**Decision**: Load all conversations from localStorage when connecting to a repo, then merge with Supabase PM conversations.

**Why**: 
- Conversations are already saved to localStorage when connected (if not using Supabase)
- On reconnect, we need to restore all agent conversations, not just PM from Supabase
- Supabase is source of truth for PM, but localStorage is source of truth for other agents

**Trade-offs**:
- If Supabase has PM conversations, they take precedence (correct behavior)
- If localStorage has stale data, it will be restored (acceptable - user can see old conversations)

## D2: Don't clear agent status on disconnect

**Decision**: Do not set agent status to 'idle' on disconnect, and do not remove localStorage items.

**Why**:
- Agent status boxes are already gated by `connectedProject`, so they're hidden when disconnected
- Preserving status in localStorage allows restoration on reconnect
- Status will be restored when reconnecting to the same repo

**Trade-offs**:
- If agent completed while disconnected, status will show as completed on reconnect (acceptable)
- If agent is still running, status will update when new messages arrive (correct behavior)

## D3: Merge Supabase and localStorage conversations

**Decision**: When both Supabase and localStorage have PM conversations, Supabase takes precedence.

**Why**:
- Supabase is the source of truth for PM conversations (they're persisted to DB)
- localStorage PM conversations might be stale if Supabase was used
- Other agent conversations only exist in localStorage, so they're always loaded from there

**Trade-offs**:
- If Supabase load fails, localStorage PM conversations are used (fallback behavior)
- If localStorage load fails, empty conversations are used (user sees empty chat, but can start new conversation)
