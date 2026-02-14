# Chat state management SOP (disconnect/reconnect)

This document defines the standard operating procedure for handling chat state during disconnect/reconnect scenarios. It specifies what must be persisted, what must be rebuilt, and how to avoid duplicate/blank artifacts and duplicate messages.

## Authoritative sources of truth

### Primary source: Supabase

**Supabase is the authoritative source of truth** for all persistent chat state:

- **Conversations and messages**: `hal_conversation_messages` table
  - Fields: `project_id`, `agent` (conversation ID), `role`, `content`, `sequence`, `created_at`, `images`
  - Messages are identified by `(project_id, agent, sequence)` tuple
  - Sequence numbers must be monotonically increasing per conversation

- **Artifacts**: `agent_artifacts` table
  - Fields: `artifact_id`, `ticket_pk`, `repo_full_name`, `agent_type`, `title`, `body_md`, `created_at`
  - Artifacts are identified by canonical identifier: `(ticket_pk, agent_type, artifact_type)`
  - Artifact types are extracted from titles (e.g., "Plan for ticket 0121" → `plan`)

- **Tickets**: `tickets` table
  - Fields: `pk`, `ticket_number`, `display_id`, `repo_full_name`, `body_md`, etc.
  - Tickets are identified by `ticket_number` (repo-scoped) or `id` (legacy)

### Secondary source: localStorage (fallback only)

**localStorage is a fallback/backup**, not an authoritative source:

- **Purpose**: Provide immediate UI state restoration when Supabase is unavailable or slow
- **Storage key format**: `hal-chat-conversations-<projectName>`
- **When to use**: 
  - Load from localStorage first (synchronously) to show conversations immediately after reconnect
  - Then load from Supabase asynchronously and merge/overwrite with Supabase data (Supabase takes precedence)
- **When NOT to use**: Never use localStorage as the source of truth when Supabase is available

### Ephemeral state (do not persist)

The following state is **ephemeral** and must be reset on disconnect/reconnect:

- `pmLastResponseId` (OpenAI Responses API continuity) — reset on disconnect and when connecting to a project
- `implAgentTicketId`, `qaAgentTicketId` (current ticket context) — reset on disconnect
- `autoMoveDiagnostics` (diagnostic messages) — reset on disconnect
- `cursorRunAgentType` (current agent run type) — reset on disconnect
- `orphanedCompletionSummary` (temporary completion state) — reset on disconnect
- `messageIdRef.current`, `pmMaxSequenceRef.current` (local sequence counters) — reset on disconnect
- `agentSequenceRefs.current` (per-conversation sequence tracking) — reset on disconnect

**Rationale**: These are session-specific and should not persist across disconnects. Each reconnect starts a fresh session.

## Reconnect checklist

When an agent reconnects to a project (or the UI reconnects after a disconnect), follow this checklist in order:

### 1. Rehydrate conversation list and active conversation from the database

**Steps:**

1. **Load from localStorage first** (synchronously):
   ```typescript
   const loadResult = loadConversationsFromStorage(projectName)
   const restoredConversations = loadResult.conversations || new Map<string, Conversation>()
   // Ensure PM conversation exists even if no messages were loaded
   const pmConvId = getConversationId('project-manager', 1)
   if (!restoredConversations.has(pmConvId)) {
     restoredConversations.set(pmConvId, {
       id: pmConvId,
       agentRole: 'project-manager',
       instanceNumber: 1,
       messages: [],
       createdAt: new Date(),
     })
   }
   setConversations(restoredConversations) // Show immediately
   ```

2. **Load from Supabase asynchronously** (if Supabase is available):
   ```typescript
   if (url && key) {
     const supabase = getSupabaseClient(url, key)
     // Load ALL conversations from Supabase (not just PM)
     // Load only the most recent MESSAGES_PER_PAGE messages per conversation for initial load
     // Group messages by agent (conversation ID format: "agent-role-instanceNumber")
     // Merge/overwrite localStorage data with Supabase data (Supabase takes precedence)
   }
   ```

3. **Update sequence tracking**:
   - For each conversation, set `agentSequenceRefs.current.set(convId, maxSequence)` based on loaded messages
   - Update `pmMaxSequenceRef.current` for PM conversation (backward compatibility)

**Critical**: Supabase data **always overwrites** localStorage data. localStorage is only for immediate UI feedback.

### 2. Re-fetch ticket content and artifacts from Supabase

**Do not rely on in-memory state** for tickets or artifacts. Always re-fetch from Supabase:

1. **Tickets**: When an agent needs ticket content, fetch via HAL API:
   ```javascript
   const baseUrl = (await readFile('.hal/api-base-url', 'utf8')).trim()
   const res = await fetch(`${baseUrl}/api/tickets/get`, {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ ticketId: '0177' }),
   })
   const result = await res.json()
   if (result.success) {
     // Use result.ticket for current ticket state
   }
   ```

2. **Artifacts**: When an agent needs artifacts, fetch via HAL API:
   ```javascript
   const res = await fetch(`${baseUrl}/api/artifacts/get`, {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ ticketId: '0177' }),
   })
   const result = await res.json()
   if (result.success) {
     // Use result.artifacts for current artifact state
   }
   ```

**Rationale**: Tickets and artifacts may have been updated by other agents or users during the disconnect. In-memory state is stale and unreliable.

### 3. De-dupe on insert: messages, artifacts, and tool-call results

**Idempotency requirements:**

#### Messages

- **Check for duplicate message IDs** before inserting:
  ```typescript
  // Deduplication: Check if a message with the same ID already exists
  const existingMessageIndex = conv.messages.findIndex(msg => msg.id === nextId)
  if (existingMessageIndex >= 0) {
    // Message with this ID already exists, skip adding duplicate
    return next
  }
  ```

- **Use sequence numbers** to prevent duplicates:
  - Messages are inserted with `sequence: msg.id` where `msg.id` is a monotonically increasing integer
  - Supabase table should have a unique constraint on `(project_id, agent, sequence)` if possible
  - Client tracks `agentSequenceRefs.current.get(convId)` to know the last saved sequence

- **On reconnect**: Only insert messages with `sequence > currentMaxSeq` (where `currentMaxSeq` is the max sequence loaded from Supabase)

#### Artifacts

- **Use canonical identifier matching** (not exact title matching):
  - Artifacts are identified by `(ticket_pk, agent_type, artifact_type)`
  - Artifact type is extracted from title (e.g., "Plan for ticket 0121" → `plan`)
  - See `api/artifacts/_shared.ts` for `findArtifactsByCanonicalId()` implementation

- **Find existing artifacts before insert**:
  ```typescript
  const { artifacts: existingArtifacts } = await findArtifactsByCanonicalId(
    supabase,
    ticket.pk,
    'implementation', // or 'qa'
    artifactType
  )
  ```

- **Update existing artifact** instead of inserting duplicate:
  - If an artifact with the same canonical identifier exists, **update** it (append with separator)
  - Delete empty/placeholder artifacts before updating
  - Delete duplicate artifacts (same canonical identifier, different titles)

- **Handle race conditions**:
  - If insert fails with duplicate key error (`23505`), find and update the existing artifact
  - Verify insert/update by reading back the artifact

#### Tool-call results

- **Tool calls are ephemeral** and should not be persisted to Supabase
- If tool-call results need to be preserved, store them as artifacts (with proper deduplication)

### 4. Guardrails to prevent creating blank "shell" artifacts

**Minimum content validation before insert:**

1. **Validate artifact body** before inserting:
   ```typescript
   // Use validation function appropriate for artifact type
   const contentValidation = hasSubstantiveContent(body_md, title) // or hasSubstantiveQAContent for QA
   if (!contentValidation.valid) {
     return { success: false, error: contentValidation.reason }
   }
   ```

2. **Validation requirements**:
   - Body must contain more than just a title or placeholder text
   - Body must have minimum length (typically > 100 characters, but type-specific)
   - Body must contain substantive content (not just whitespace, headers, or boilerplate)

3. **Clean up empty artifacts**:
   - Before updating an existing artifact, check if it has substantive content
   - Delete empty/placeholder artifacts automatically
   - Log cleanup actions for auditability

4. **Verify after insert**:
   - After inserting or updating an artifact, read it back from Supabase
   - Verify the persisted `body_md` length matches expectations
   - Log verification results

**Example validation** (from `api/artifacts/_validation.ts`):
- Rejects artifacts with only title, whitespace, or placeholder text
- Accepts artifacts with structured content (sections, tables, lists, code blocks)
- Type-specific validation for QA reports (allows structured reports with sections/tables)

## Failure-mode guidance

### What to do if duplicates are detected

1. **Messages**:
   - If duplicate message detected (same `sequence` in same conversation), skip insertion
   - Log warning but do not fail the operation
   - Client-side deduplication (check `existingMessageIndex`) prevents UI duplicates

2. **Artifacts**:
   - If duplicate artifact detected (same canonical identifier), **update** the existing artifact instead of inserting
   - Delete empty/placeholder duplicates automatically
   - Delete duplicate artifacts with different titles but same canonical identifier
   - Log cleanup actions (`cleaned_up_duplicates` count in response)

3. **Tickets**:
   - Tickets should not have duplicates (enforced by database constraints)
   - If duplicate ticket detected, use the one with the most recent `updated_at` timestamp

### What to do if artifact insert is retried

1. **Handle race conditions**:
   - If insert fails with duplicate key error (`23505`), find the existing artifact and update it
   - Return success with `action: 'updated'` and `race_condition_handled: true`

2. **Retry logic**:
   - Artifact insertion endpoints should handle one retry automatically (find and update on duplicate key error)
   - Do not implement exponential backoff or multiple retries (single retry is sufficient)
   - Log retry attempts for debugging

3. **Idempotency**:
   - Artifact insertion should be idempotent: calling it multiple times with the same content should result in the same final state
   - Use canonical identifier matching to ensure idempotency

### What to do if network flaps cause replays

1. **Message replays**:
   - Sequence numbers prevent duplicate message insertion
   - Client tracks `agentSequenceRefs.current.get(convId)` to know the last saved sequence
   - Only insert messages with `sequence > currentMaxSeq`

2. **Artifact replays**:
   - Canonical identifier matching ensures updates instead of duplicates
   - Empty artifacts are cleaned up automatically
   - Verification after insert ensures persistence

3. **State reconciliation**:
   - On reconnect, always re-fetch from Supabase (authoritative source)
   - Supabase data overwrites localStorage data
   - Sequence tracking ensures no gaps or duplicates

4. **UI state**:
   - If network flaps cause UI to show stale state, reconnect will refresh from Supabase
   - localStorage is only for immediate UI feedback, not source of truth

## Verification procedure

A human can follow these steps in the HAL UI to confirm the SOP is being followed:

### Test 1: Reconnect and verify no duplicate messages

1. **Setup**:
   - Connect to a project in HAL
   - Send a few messages in PM chat (e.g., "Hello", "Create a ticket for testing")
   - Wait for responses

2. **Disconnect**:
   - Click "Disconnect" button
   - Verify conversations are cleared from UI (placeholder shown)

3. **Reconnect**:
   - Click "Connect Project Folder" and select the same project
   - Wait for conversations to load

4. **Verify**:
   - Open PM chat
   - Check that messages appear exactly once (no duplicates)
   - Check that message order is correct (oldest to newest)
   - Check that sequence numbers are continuous (no gaps)

### Test 2: Reconnect and verify no duplicate artifacts

1. **Setup**:
   - Connect to a project
   - Have an agent create an artifact (e.g., "Create a ticket" → PM creates ticket → Implementation agent creates plan artifact)
   - Note the artifact title and content

2. **Disconnect and reconnect**:
   - Disconnect from project
   - Reconnect to the same project

3. **Verify**:
   - Open the ticket in Kanban
   - Check that artifacts appear exactly once (no duplicates)
   - Check that artifact content matches what was created before disconnect
   - Check that artifact titles are canonical (e.g., "Plan for ticket 0177", not "Plan for ticket HAL-0177")

### Test 3: Verify no blank artifacts

1. **Setup**:
   - Connect to a project
   - Trigger an agent to create an artifact (e.g., "Implement ticket 0177")

2. **Monitor**:
   - Watch the agent's tool calls in the chat
   - If agent attempts to insert an artifact with empty/placeholder content, it should be rejected with validation error

3. **Verify**:
   - After agent completes, check ticket artifacts in Kanban
   - Verify all artifacts have substantive content (not just titles or placeholders)
   - Verify no empty "shell" artifacts exist

### Test 4: Verify Supabase is authoritative source

1. **Setup**:
   - Connect to project A, send messages
   - Disconnect
   - Manually modify Supabase `hal_conversation_messages` table (add a test message with high sequence number)

2. **Reconnect**:
   - Reconnect to project A
   - Wait for conversations to load

3. **Verify**:
   - Check that the manually added message appears in the chat
   - This confirms Supabase data overwrites localStorage data

### Test 5: Verify ticket/artifact re-fetch on reconnect

1. **Setup**:
   - Connect to project, have agent work on a ticket
   - Disconnect
   - Manually update ticket body or artifacts in Supabase

2. **Reconnect and agent work**:
   - Reconnect to project
   - Have agent continue work on the same ticket (e.g., "Continue work on ticket 0177")

3. **Verify**:
   - Agent should see the updated ticket/artifact content (not stale in-memory state)
   - Check agent's tool calls: they should fetch from Supabase via HAL API, not use cached state

## Summary

- **Authoritative source**: Supabase (conversations, messages, artifacts, tickets)
- **Fallback**: localStorage (for immediate UI feedback only)
- **Ephemeral**: Session-specific state (response IDs, ticket IDs, diagnostics)
- **Reconnect**: Load from localStorage first, then Supabase overwrites
- **Deduplication**: Sequence numbers for messages, canonical identifiers for artifacts
- **Validation**: Minimum content requirements before artifact insertion
- **Failure handling**: Update existing instead of duplicate, handle race conditions, reconcile on reconnect

## Implementation references

- **Message persistence**: `src/App.tsx` lines 1409-1487 (conversation persistence effect)
- **Message deduplication**: `src/App.tsx` lines 1642-1645 (client-side dedup)
- **Artifact insertion**: `api/artifacts/insert-implementation.ts`, `api/artifacts/insert-qa.ts`
- **Artifact validation**: `api/artifacts/_validation.ts` (content validation)
- **Artifact canonical matching**: `api/artifacts/_shared.ts` (canonical identifier matching)
- **localStorage helpers**: `src/App.tsx` lines 148-200 (conversation storage helpers)
- **Reconnect flow**: `src/App.tsx` lines 626-950 (project connection and conversation restoration)

## Related tickets

- **HAL-0097**: Fix empty PM chat after reconnect (localStorage persistence)
- **HAL-0121**: Prevent blank/placeholder artifacts (validation before insert)
- **HAL-0124**: Save all conversations to Supabase (not just PM)
- **HAL-0153**: Prevent duplicate messages (client-side deduplication)
