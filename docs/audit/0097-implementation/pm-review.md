# PM Review: 0097 - Preserve chats across disconnect/reconnect

## Summary

- Added `loadConversationsFromStorage()` function to restore conversations from localStorage
- Modified `handleSelectGithubRepo` to load conversations and agent status from localStorage on reconnect
- Modified `handleDisconnect` to preserve localStorage items (conversations and agent status)
- Conversations are merged: Supabase PM takes precedence, other agents from localStorage

## Likelihood of success

**Score (0–100%)**: 85%

**Why (bullets):**
- Implementation follows existing patterns for localStorage persistence
- Agent status boxes are already gated by `connectedProject`, so preserving status won't cause UI issues
- Conversation loading logic is straightforward (load from localStorage, merge with Supabase)
- Potential edge case: if Supabase load fails, localStorage conversations are used (acceptable fallback)

## What to verify (UI-only)

- Connect to repo, create multiple agent chats, disconnect, reconnect → all chats visible with history
- Start agent run, disconnect, reconnect → agent status box returns with same status
- Verify no duplicate chat threads after reconnect
- Verify PM conversations from Supabase (not stale localStorage data)

## Potential failures (ranked)

1. **Conversations not restored** — Chat previews don't appear after reconnect — `loadConversationsFromStorage` not called or returns empty — Check Diagnostics for persistence errors, verify localStorage has data
2. **Agent status not restored** — Status boxes don't return after reconnect — Status not loaded from localStorage — Check Diagnostics, verify localStorage has status data
3. **Duplicate chat threads** — Multiple instances of same agent chat — Conversations merged incorrectly — Check chat preview stack, verify conversation IDs are unique
4. **Stale PM data** — PM chat shows old messages instead of Supabase data — Supabase load failed or merge logic incorrect — Check PM chat messages, verify Supabase connection

## Audit completeness check

- **Artifacts present**: plan / worklog / changed-files / decisions / verification / pm-review
- **Traceability gaps**: None

## Follow-ups (optional)

- Consider adding in-app diagnostics to show when conversations are loaded from localStorage vs Supabase
- Consider adding error handling UI if localStorage load fails
