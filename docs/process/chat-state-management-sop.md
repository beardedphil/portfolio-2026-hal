# Chat state management SOP (disconnect/reconnect)

This SOP defines how agents must handle chat state during disconnect/reconnect scenarios to prevent duplicate messages, duplicate artifacts, blank "shell" artifacts, and state inconsistencies.

## Authoritative sources of truth

### Primary source: Supabase

**Supabase is the authoritative source of truth** for all persistent chat state:

1. **Conversations and messages** (`hal_conversation_messages` table)
   - **Fields**: `project_id`, `agent` (conversation ID), `role`, `content`, `sequence`, `created_at`, `images`
   - **Key**: Messages are identified by `(project_id, agent, sequence)` tuple
   - **Usage**: Always rehydrate conversation history from this table on reconnect
   - **Constraint**: Sequence numbers must be monotonically increasing per conversation

2. **Conversation summaries** (`hal_conversation_summaries` table)
   - **Fields**: `project_id`, `agent`, `summary_text`, `through_sequence`, `updated_at`
   - **Usage**: Provides bounded context for older messages; updated by HAL when needed

3. **Artifacts** (`agent_artifacts` table)
   - **Fields**: `artifact_id`, `ticket_pk`, `repo_full_name`, `agent_type`, `artifact_type`, `title`, `body_md`, `created_at`, `updated_at`
   - **Key**: Artifacts are identified by canonical identifier: `(ticket_pk, agent_type, artifact_type)`
   - **Usage**: Always check for existing artifacts before inserting; use idempotency keys if available
   - **Note**: Artifact types are extracted from titles (e.g., "Plan for ticket 0121" → `plan`)

4. **Tickets** (`tickets` table)
   - **Fields**: `pk`, `ticket_number`, `display_id`, `repo_full_name`, `body_md`, `column_id`, `position`, etc.
   - **Key**: Tickets are identified by `ticket_number` (repo-scoped) or `id` (legacy)
   - **Usage**: Always re-fetch ticket content from Supabase; never rely on in-memory state

5. **Kanban columns** (`kanban_columns` table)
   - **Fields**: `id`, `title`, `position`, etc.
   - **Usage**: Re-fetch column structure on reconnect

### Secondary source: localStorage (fallback only)

**localStorage is a fallback/backup**, not an authoritative source:

- **Purpose**: Provide immediate UI state restoration when Supabase is unavailable or slow
- **Storage key format**: `hal-chat-conversations-<projectName>`
- **When to use**: 
  - Load from localStorage first (synchronously) to show conversations immediately after reconnect
  - Then load from Supabase asynchronously and merge/overwrite with Supabase data (Supabase takes precedence)
- **When NOT to use**: Never use localStorage as the source of truth when Supabase is available

**CRITICAL**: Supabase data **always overwrites** localStorage data. localStorage is only for immediate UI feedback.

### Ephemeral state (must be rebuilt)

The following state is **ephemeral** and must be reset on disconnect/reconnect:

1. **In-memory conversation transcripts** - Rebuild from `hal_conversation_messages`
2. **In-memory ticket cache** - Rebuild from `tickets` table
3. **In-memory artifact cache** - Rebuild from `agent_artifacts` table
4. **UI state** (React state, component state) - Rebuild from Supabase queries
5. **Tool call results** - Rebuild from artifacts/messages if needed
6. **Context pack summaries** - Rebuild from `hal_conversation_summaries` and recent messages
7. **Session-specific state** (must be reset):
   - `pmLastResponseId` (OpenAI Responses API continuity) — reset on disconnect and when connecting to a project
   - `implAgentTicketId`, `qaAgentTicketId` (current ticket context) — reset on disconnect
   - `autoMoveDiagnostics` (diagnostic messages) — reset on disconnect
   - `cursorRunAgentType` (current agent run type) — reset on disconnect
   - `orphanedCompletionSummary` (temporary completion state) — reset on disconnect
   - `messageIdRef.current`, `pmMaxSequenceRef.current` (local sequence counters) — reset on disconnect
   - `agentSequenceRefs.current` (per-conversation sequence tracking) — reset on disconnect

**Rationale**: These are session-specific and should not persist across disconnects. Each reconnect starts a fresh session.

**CRITICAL**: Never assume in-memory state persists across disconnects. Always re-fetch from Supabase.

## Reconnect checklist

When an agent reconnects after a disconnect (network failure, process restart, session timeout, etc.), follow this checklist **in order**:

### 1. Rehydrate conversation list and active conversation from the database

**Steps:**

1. **Load from localStorage first** (synchronously, for immediate UI feedback):
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

2. **Load from Supabase asynchronously** (authoritative source):
   - Query `hal_conversation_messages` for the current `(project_id, agent)` pair
   - Order by `sequence` ASC to reconstruct message order
   - Load ALL conversations from Supabase (not just PM)
   - Load only the most recent MESSAGES_PER_PAGE messages per conversation for initial load
   - Group messages by agent (conversation ID format: "agent-role-instanceNumber")
   - Merge/overwrite localStorage data with Supabase data (Supabase takes precedence)
   - Identify the active conversation by checking the most recent `sequence` value
   - Load conversation summary from `hal_conversation_summaries` if available (for context pack)

   ```typescript
   if (url && key) {
     const supabase = getSupabaseClient(url, key)
     // Load ALL conversations from Supabase (not just PM)
     // Load only the most recent MESSAGES_PER_PAGE messages per conversation for initial load
     // Group messages by agent (conversation ID format: "agent-role-instanceNumber")
     // Merge/overwrite localStorage data with Supabase data (Supabase takes precedence)
   }
   ```

   **Example query pattern:**
   ```sql
   SELECT * FROM hal_conversation_messages
   WHERE project_id = $1 AND agent = $2
   ORDER BY sequence ASC;
   ```

3. **Update sequence tracking**:
   - For each conversation, set `agentSequenceRefs.current.set(convId, maxSequence)` based on loaded messages
   - Update `pmMaxSequenceRef.current` for PM conversation (backward compatibility)

**Critical**: Supabase data **always overwrites** localStorage data. localStorage is only for immediate UI feedback.

### 2. Re-fetch ticket content and artifacts from Supabase

**Do not rely on in-memory state** for tickets or artifacts. Always re-fetch from Supabase:

- [ ] **Re-fetch ticket content** using HAL API endpoint `/api/tickets/get` or direct Supabase query
  - Do not rely on ticket content stored in conversation messages
  - Do not use in-memory ticket cache

- [ ] **Re-fetch all artifacts** for the ticket using HAL API endpoint `/api/artifacts/get` or direct Supabase query
  - Query `agent_artifacts` table filtered by `ticket_id`
  - Do not rely on artifact content stored in conversation messages

- [ ] **Verify artifact completeness** - Check that all expected artifacts exist (plan, worklog, changed-files, decisions, verification, pm-review, qa-report if applicable)

**Example API call:**
```javascript
const baseUrl = (await readFile('.hal/api-base-url', 'utf8')).trim()
const ticketRes = await fetch(`${baseUrl}/api/tickets/get`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ticketId: '0177' }),
})
const result = await ticketRes.json()
if (result.success) {
  // Use result.ticket for current ticket state
}

const artifactsRes = await fetch(`${baseUrl}/api/artifacts/get`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ticketId: '0177' }),
})
const artifactsResult = await artifactsRes.json()
if (result.success) {
  // Use result.artifacts for current artifact state
}
```

**Rationale**: Tickets and artifacts may have been updated by other agents or users during the disconnect. In-memory state is stale and unreliable.

### 3. De-dupe on insert: messages, artifacts, and tool-call results

**Idempotency requirements:**

#### Messages

- [ ] **Check for duplicate message IDs** before inserting:
  ```typescript
  // Deduplication: Check if a message with the same ID already exists
  const existingMessageIndex = conv.messages.findIndex(msg => msg.id === nextId)
  if (existingMessageIndex >= 0) {
    // Message with this ID already exists, skip adding duplicate
    return next
  }
  ```

- [ ] **Use sequence numbers** to prevent duplicates:
  - Before inserting a new message, check if a message with the same `(project_id, agent, sequence)` already exists
  - If inserting a message, calculate the next `sequence` value by querying `MAX(sequence) + 1` for the `(project_id, agent)` pair
  - Messages are inserted with `sequence: msg.id` where `msg.id` is a monotonically increasing integer
  - Supabase table should have a unique constraint on `(project_id, agent, sequence)` if possible
  - Client tracks `agentSequenceRefs.current.get(convId)` to know the last saved sequence
  - Use database constraints (unique index on `(project_id, agent, sequence)`) to prevent duplicates
  - Handle unique constraint violations gracefully (treat as "already exists")

- [ ] **On reconnect**: Only insert messages with `sequence > currentMaxSeq` (where `currentMaxSeq` is the max sequence loaded from Supabase)

#### Artifacts

- [ ] **Use canonical identifier matching** (not exact title matching):
  - Before inserting an artifact, query `agent_artifacts` for existing artifacts with the same canonical identifier
  - Artifacts are identified by `(ticket_pk, agent_type, artifact_type)`
  - Artifact type is extracted from title (e.g., "Plan for ticket 0121" → `plan`)
  - See `api/artifacts/_shared.ts` for `findArtifactsByCanonicalId()` implementation

- [ ] **Find existing artifacts before insert**:
  ```typescript
  const { artifacts: existingArtifacts } = await findArtifactsByCanonicalId(
    supabase,
    ticket.pk,
    'implementation', // or 'qa'
    artifactType
  )
  ```

- [ ] **Update existing artifact** instead of inserting duplicate:
  - If an artifact exists, **update** it rather than inserting a duplicate
  - Use HAL API endpoints which handle deduplication automatically (`/api/artifacts/insert-implementation`, `/api/artifacts/insert-qa`)
  - Check API response `action` field: `"inserted"` vs `"updated"` to confirm behavior
  - Delete empty/placeholder artifacts before updating
  - Delete duplicate artifacts (same canonical identifier, different titles)

- [ ] **Handle race conditions**:
  - If insert fails with duplicate key error (`23505`), find and update the existing artifact
  - Verify insert/update by reading back the artifact

**Example artifact deduplication:**
```javascript
// HAL API handles deduplication automatically
const res = await fetch(`${baseUrl}/api/artifacts/insert-implementation`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    ticketId: '0177',
    artifactType: 'plan',
    title: 'Plan for ticket 0177',
    body_md: '...',
  }),
})
const result = await res.json()
// result.action will be 'inserted' or 'updated'
```

#### Tool-call results

- [ ] **Tool calls are ephemeral** and should not be persisted to Supabase
- [ ] **If tool calls produce artifacts or messages**, ensure idempotency
- [ ] **Use deterministic identifiers** (e.g., `ticket_id + artifact_type + title`) for deduplication
- [ ] **Store tool call results in artifacts** rather than recreating them on reconnect

### 4. Guardrails to prevent creating blank "shell" artifacts

**Minimum content validation before insert:**

- [ ] **Validate artifact body** before inserting:
  ```typescript
  // Use validation function appropriate for artifact type
  const contentValidation = hasSubstantiveContent(body_md, title) // or hasSubstantiveQAContent for QA
  if (!contentValidation.valid) {
    return { success: false, error: contentValidation.reason }
  }
  ```

- [ ] **Validation requirements**:
  - **Title**: Must be non-empty, meaningful (not placeholder like `<title>`)
  - **Body**: Must contain substantial content (minimum length threshold, e.g., 100 characters for plan/worklog, 50 for decisions)
  - **Body must have minimum length** (typically > 100 characters, but type-specific)
  - **Body must contain substantive content** (not just whitespace, headers, or boilerplate)
  - **Artifact type**: Must match allowed values (plan, worklog, changed-files, decisions, verification, pm-review, qa-report)
  - **Ticket ID**: Must be valid and exist in `tickets` table

- [ ] **Never insert placeholder artifacts**:
  - Do not insert artifacts with placeholder text like `<AC 1>`, `<what we want to achieve>`, `<fill this in later>`
  - Do not insert artifacts with only headers and no content
  - Do not insert artifacts with empty sections (e.g., "## Plan\n\n" with no plan content)

- [ ] **Complete artifacts before insert**:
  - Ensure all required sections are filled (e.g., plan must have actual plan content, not just "## Plan\n\n")
  - If an artifact is incomplete, wait until it's complete before inserting
  - Use draft/scratch space (in-memory or temporary files) until artifact is ready

- [ ] **Clean up empty artifacts**:
  - Before updating an existing artifact, check if it has substantive content
  - Delete empty/placeholder artifacts automatically
  - Log cleanup actions for auditability

- [ ] **Verify after insert**:
  - After inserting or updating an artifact, read it back from Supabase
  - Verify the persisted `body_md` length matches expectations
  - Log verification results

**Example validation** (from `api/artifacts/_validation.ts`):
- Rejects artifacts with only title, whitespace, or placeholder text
- Accepts artifacts with structured content (sections, tables, lists, code blocks)
- Type-specific validation for QA reports (allows structured reports with sections/tables)

## Failure-mode guidance

### Duplicate messages detected

**Symptom**: Multiple messages with the same `(project_id, agent, sequence)` appear in conversation.

**Response**:
1. **Do not insert duplicate messages** - Check for existing message before insert
2. **Handle unique constraint violations** - If database throws unique constraint error, treat as "message already exists" and continue
3. **Log the duplicate detection** - Record that a duplicate was prevented (for debugging)
4. **Continue normal operation** - Do not fail or retry; the duplicate was prevented
5. **Client-side deduplication** (check `existingMessageIndex`) prevents UI duplicates

**Example handling:**
```javascript
try {
  await insertMessage({ project_id, agent, sequence, role, content })
} catch (error) {
  if (error.code === '23505') { // PostgreSQL unique_violation
    // Message already exists, continue
    console.log('Message already exists, skipping insert')
  } else {
    throw error
  }
}
```

### Artifact insert retried

**Symptom**: Network failure or timeout during artifact insert, agent retries the insert.

**Response**:
1. **Use HAL API endpoints** - They handle idempotency automatically (same `(ticket_id, artifact_type, title)` updates existing artifact)
2. **Check API response** - If `action: "updated"`, the artifact already existed and was updated (this is correct behavior)
3. **Do not treat "updated" as error** - An update is the expected behavior when retrying
4. **Verify artifact content** - After insert/update, re-fetch the artifact to confirm it has the correct content
5. **Handle race conditions**:
   - If insert fails with duplicate key error (`23505`), find the existing artifact and update it
   - Return success with `action: 'updated'` and `race_condition_handled: true`
6. **Retry logic**:
   - Artifact insertion endpoints should handle one retry automatically (find and update on duplicate key error)
   - Do not implement exponential backoff or multiple retries (single retry is sufficient)
   - Log retry attempts for debugging
7. **Idempotency**:
   - Artifact insertion should be idempotent: calling it multiple times with the same content should result in the same final state
   - Use canonical identifier matching to ensure idempotency

**Example:**
```javascript
const res = await fetch(`${baseUrl}/api/artifacts/insert-implementation`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ticketId, artifactType, title, body_md }),
})
const result = await res.json()
if (result.success) {
  if (result.action === 'updated') {
    // This is expected on retry - artifact was updated, not duplicated
    console.log('Artifact updated (idempotent retry)')
  }
}
```

### Network flaps cause replays

**Symptom**: Network connectivity issues cause the same tool call or message to be sent multiple times.

**Response**:
1. **Idempotent operations** - All inserts (messages, artifacts, ticket moves) must be idempotent
2. **Use sequence numbers for messages** - Calculate sequence from database state, not from in-memory counter
3. **Use deterministic identifiers** - For artifacts, use `(ticket_id, artifact_type, title)` as the natural key
4. **Check-before-insert pattern** - Always query for existing records before inserting
5. **Handle race conditions** - Use database constraints (unique indexes) as the final guard against duplicates
6. **Message replays**:
   - Sequence numbers prevent duplicate message insertion
   - Client tracks `agentSequenceRefs.current.get(convId)` to know the last saved sequence
   - Only insert messages with `sequence > currentMaxSeq`
7. **Artifact replays**:
   - Canonical identifier matching ensures updates instead of duplicates
   - Empty artifacts are cleaned up automatically
   - Verification after insert ensures persistence
8. **State reconciliation**:
   - On reconnect, always re-fetch from Supabase (authoritative source)
   - Supabase data overwrites localStorage data
   - Sequence tracking ensures no gaps or duplicates
9. **UI state**:
   - If network flaps cause UI to show stale state, reconnect will refresh from Supabase
   - localStorage is only for immediate UI feedback, not source of truth

**Example sequence calculation:**
```javascript
// Always calculate sequence from database, not memory
const maxSequence = await query(
  'SELECT MAX(sequence) FROM hal_conversation_messages WHERE project_id = $1 AND agent = $2',
  [project_id, agent]
)
const nextSequence = (maxSequence?.max || -1) + 1
```

### Partial artifact insert (blank "shell" created)

**Symptom**: An artifact was inserted but contains only headers/placeholders, not actual content.

**Response**:
1. **Update the artifact immediately** - Re-fetch the artifact, add the missing content, and update it
2. **Do not create a new artifact** - Update the existing one (use HAL API which handles updates)
3. **Validate before future inserts** - Ensure validation passes before any artifact insert
4. **Log the correction** - Record that a blank artifact was detected and corrected

**Example:**
```javascript
// Detect blank artifact
const artifact = await fetchArtifact(artifact_id)
if (isBlankArtifact(artifact)) {
  // Update with complete content
  await fetch(`${baseUrl}/api/artifacts/insert-implementation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ticketId,
      artifactType,
      title,
      body_md: completeContent, // Full content, not placeholder
    }),
  })
}
```

### Conversation state mismatch

**Symptom**: In-memory conversation state doesn't match database state (messages missing, out of order, etc.).

**Response**:
1. **Discard in-memory state** - Never trust in-memory state after a disconnect
2. **Re-fetch from database** - Always rebuild conversation from `hal_conversation_messages`
3. **Verify sequence continuity** - Check that `sequence` values are consecutive (0, 1, 2, ...) with no gaps
4. **Handle gaps gracefully** - If sequence gaps exist, they may indicate deleted messages; continue with next available sequence

## Verification procedure

A human can follow this procedure in the HAL UI to verify that agents are following this SOP:

### Prerequisites

1. **Connect a project folder** in HAL (provides Supabase credentials)
2. **Have an active conversation** with an agent (PM, Implementation, or QA)
3. **Have a ticket** in the kanban that the agent is working on

### Test steps

#### Test 1: Reconnect and verify no duplicate messages

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

#### Test 2: Reconnect and verify no duplicate artifacts

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

#### Test 3: Verify no blank artifacts

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

#### Test 4: Verify Supabase is authoritative source

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

#### Test 5: Verify ticket/artifact re-fetch on reconnect

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

### Expected results

- ✅ **All messages preserved** - No messages lost after reconnect
- ✅ **No duplicate messages** - Each message appears exactly once
- ✅ **No duplicate artifacts** - Each artifact type appears once per ticket
- ✅ **No blank artifacts** - All artifacts have substantial content (not just headers/placeholders)
- ✅ **State consistency** - Conversation, tickets, and artifacts match database state
- ✅ **Graceful continuation** - Agent continues work seamlessly after reconnect

### Failure indicators

- ❌ **Messages missing** - Some messages from before reconnect are gone
- ❌ **Duplicate messages** - Same message appears multiple times in conversation
- ❌ **Duplicate artifacts** - Multiple artifacts with same `(ticket_id, artifact_type, title)`
- ❌ **Blank artifacts** - Artifacts exist but contain only headers/placeholders
- ❌ **State mismatch** - Conversation shows different content than database
- ❌ **Agent restarts** - Agent loses context and starts over after reconnect

### Reporting issues

If any failure indicators are observed:

1. **Check Supabase directly** - Query `hal_conversation_messages` and `agent_artifacts` tables to verify database state
2. **Check agent logs** - Review agent execution logs for errors during reconnect
3. **Document the issue** - Create a bugfix ticket describing the failure mode
4. **Reference this SOP** - Note which checklist item or failure mode was not followed

## Summary

**Key principles**:
1. **Supabase is authoritative** - Always re-fetch from database, never trust in-memory state
2. **localStorage is fallback only** - Use for immediate UI feedback, but Supabase always overwrites
3. **Idempotency everywhere** - All inserts must be safe to retry (check-before-insert, use natural keys)
4. **Validate before insert** - Never insert blank/placeholder artifacts
5. **Handle failures gracefully** - Duplicate prevention is expected behavior, not an error

**When in doubt**: Re-fetch from Supabase and check for existing records before inserting anything.

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
