# Plan: 0097 - Preserve chats across disconnect/reconnect

## Goal

Ensure disconnecting from a repo and then reconnecting does not lose chats for any currently running agent instances.

## Analysis

### Current State
- Conversations are saved to localStorage when connected (if not using Supabase)
- On disconnect, conversations are cleared from state AND localStorage items are removed
- On reconnect, only PM conversations are loaded from Supabase
- Implementation-agent and qa-agent conversations are not restored
- Agent status is cleared on disconnect and localStorage items are removed

### Required Changes

1. **Load conversations from localStorage on reconnect**: When connecting to a repo, load all conversations (not just PM from Supabase)
2. **Merge Supabase and localStorage conversations**: PM conversations from Supabase take precedence, but other agent conversations come from localStorage
3. **Preserve agent status on disconnect**: Don't clear agent status state or localStorage on disconnect (status boxes are already gated by `connectedProject`)
4. **Restore agent status on reconnect**: Load agent status from localStorage when reconnecting

## Implementation Steps

### Step 1: Create loadConversationsFromStorage function
- Add function to deserialize and load conversations from localStorage
- Handle Date deserialization for timestamps
- Return Map<string, Conversation> or empty Map

### Step 2: Modify handleSelectGithubRepo
- Load conversations from localStorage first (for all agents)
- Load PM conversations from Supabase
- Merge: Supabase PM takes precedence, keep other agents from localStorage
- Set merged conversations

### Step 3: Modify handleDisconnect
- Do NOT remove localStorage items (conversations and agent status)
- Clear conversations from state (UI will show placeholder)
- Do NOT set agent status to 'idle' (status boxes are gated by `connectedProject`)

### Step 4: Restore agent status on reconnect
- In handleSelectGithubRepo, restore agent status from localStorage
- Restore status, progress, and error for both Implementation and QA agents

## Files to Change

- `src/App.tsx`: Add loadConversationsFromStorage, modify handleSelectGithubRepo and handleDisconnect

## Testing Approach

1. Connect to a repo
2. Start conversations with multiple agents (PM, Implementation, QA)
3. Verify agent status boxes are visible for running agents
4. Disconnect from repo
5. Reconnect to the same repo
6. Verify all chat previews are still visible
7. Open each chat and verify conversation history is preserved
8. Verify agent status boxes return and match current states
9. Verify no duplicate chat threads are created
