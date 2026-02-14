# Chat State Management SOP (Disconnect/Reconnect)

This Standard Operating Procedure defines how agents must handle chat state during disconnect/reconnect scenarios to ensure data integrity, prevent duplicates, and maintain a consistent user experience.

## Authoritative Sources of Truth

### Primary Sources (Persistent, Authoritative)

1. **Supabase Database** — The single source of truth for all persistent chat state:
   - **Conversations and Messages**: `hal_conversation_messages` table
     - Fields: `project_id`, `agent`, `role`, `content`, `sequence`, `created_at`, `images`
     - Messages are identified by `(project_id, agent, sequence)` tuple
   - **Artifacts**: `agent_artifacts` table
     - Fields: `ticket_pk`, `repo_full_name`, `agent_type`, `title`, `body_md`, `created_at`
     - Artifacts are identified by `(ticket_pk, agent_type, title)` tuple
   - **Tickets**: `tickets` table
     - Fields: `ticket_pk`, `repo_full_name`, `display_id`, `title`, `body_md`, `kanban_column_id`
     - Tickets are identified by `(repo_full_name, display_id)` or `ticket_pk`

2. **localStorage** — Secondary backup for conversations (fallback when Supabase unavailable):
   - Key format: `hal-conversations-${projectName}`
   - Used for immediate UI restoration on reconnect
   - **Not authoritative** — Supabase data always takes precedence when available

### Ephemeral State (Must Not Be Relied Upon)

- **In-memory React state** (`conversations`, `selectedConversationId`, etc.)
- **Client-side UI state** (scroll position, expanded groups, etc.)
- **Agent runtime state** (in-progress tool calls, streaming responses)
- **Browser session state** (not persisted across disconnects)

**Critical Rule**: On reconnect, **always re-fetch from Supabase** (or localStorage if Supabase unavailable). Never assume in-memory state is valid.

## Reconnect Checklist

When a chat agent reconnects after a disconnect, it **must** follow these steps in order:

### 1. Rehydrate Conversation List and Active Conversation

- **Step 1.1**: Load conversations from localStorage first (synchronously) to show them immediately in the UI
  - Use `loadConversationsFromStorage(projectName)` helper
  - This provides instant UI feedback while Supabase loads
- **Step 1.2**: If Supabase is available, load conversations from `hal_conversation_messages` table
  - Query by `project_id = ${projectName}`
  - Group by `agent` field (which stores conversation ID, e.g., `"project-manager-1"`)
  - Order by `sequence` ascending within each conversation
  - Merge with localStorage data, **with Supabase taking precedence** (overwrite localStorage data)
- **Step 1.3**: Ensure default conversations exist
  - If no PM conversation exists, create empty conversation: `project-manager-1`
  - This prevents empty chat UI after reconnect
- **Step 1.4**: Restore selected conversation from localStorage
  - Key: `hal-selected-conversation-${projectName}`
  - If saved conversation ID exists in loaded conversations, select it
  - Otherwise, select the most recent conversation or default to PM

### 2. Re-fetch Ticket Content and Artifacts from Supabase

- **Step 2.1**: For any ticket referenced in the conversation, re-fetch from Supabase
  - Use HAL API endpoint: `POST /api/tickets/get` with `{ ticketId: string }`
  - Or query Supabase `tickets` table directly
  - **Do not rely on** in-memory ticket state or cached ticket data
- **Step 2.2**: Re-fetch all artifacts for referenced tickets
  - Use HAL API endpoint: `POST /api/artifacts/get` with `{ ticketId: string }`
  - Or query Supabase `agent_artifacts` table filtered by `ticket_pk`
  - **Do not rely on** in-memory artifact state
- **Step 2.3**: Update UI with fresh ticket and artifact data
  - Replace any cached or in-memory references with database values

### 3. De-dupe on Insert: Messages, Artifacts, and Tool-Call Results

#### Messages

- **Before inserting a message**:
  - Check if message with same `(project_id, agent, sequence)` already exists in Supabase
  - If exists, **skip insert** (idempotent operation)
- **Implementation pattern**:
  ```typescript
  // Track max sequence per conversation to avoid re-inserting
  const currentMaxSeq = agentSequenceRefs.current.get(convId) ?? 0
  const messagesToSave = conv.messages.filter(msg => msg.id > currentMaxSeq)
  // Only insert messages with sequence > currentMaxSeq
  ```
- **On duplicate key error** (PostgreSQL `23505`):
  - Log warning and continue (another process may have inserted)
  - Update local sequence tracking to reflect existing max sequence

#### Artifacts

- **Before inserting an artifact**:
  - Query for existing artifacts with same `(ticket_pk, agent_type, title)`
  - If found with content: **update** the existing artifact (do not create duplicate)
  - If found but empty/placeholder: **delete** empty ones, then update or insert
- **Implementation pattern** (see `vite.config.ts` `insertAgentArtifact`):
  ```typescript
  // 1. Find all existing artifacts with same title
  // 2. Delete empty/placeholder artifacts
  // 3. If artifact with content exists, update it
  // 4. Otherwise, insert new artifact
  // 5. On duplicate key error, query and update the newly created artifact
  ```
- **Validation before insert**:
  - Use `hasSubstantiveContent(bodyMd, title)` to validate content
  - Skip insert if content is empty or placeholder (prevents blank "shell" artifacts)

#### Tool-Call Results

- **For tool calls that write to Supabase** (e.g., `insert_implementation_artifact`, `insert_qa_artifact`):
  - Tool implementations must be idempotent
  - Check for existing records before inserting
  - Use update-on-conflict or query-then-update patterns
- **For tool calls that modify tickets** (e.g., `move_ticket`):
  - Verify ticket exists and current state before modifying
  - Handle race conditions (ticket may have been moved by another process)

### 4. Guardrails to Prevent Blank "Shell" Artifacts

- **Minimum content validation**:
  - Before inserting any artifact, validate using `hasSubstantiveContent(bodyMd, title)`
  - Reject artifacts that are:
    - Empty strings
    - Placeholder text (e.g., "TODO", "Coming soon", single punctuation)
    - Only whitespace
- **Validation function** (see `api/artifacts/_validation.ts`):
  ```typescript
  hasSubstantiveContent(bodyMd: string, title: string): { valid: boolean; reason?: string }
  ```
- **Cleanup on insert**:
  - When inserting/updating an artifact, delete any existing empty/placeholder artifacts with the same `(ticket_pk, agent_type, title)`
  - This prevents accumulation of blank artifacts from failed or interrupted operations
- **Error handling**:
  - If validation fails, **do not insert** the artifact
  - Log a warning with the reason
  - Continue execution (do not fail the entire operation)

## Failure-Mode Guidance

### Scenario 1: Duplicates Detected After Insert

**Symptom**: Multiple messages/artifacts with identical content appear in the database.

**Response**:
1. **For messages**: Use sequence-based deduplication
   - Query for messages with duplicate `(project_id, agent, sequence)`
   - Keep the one with earliest `created_at`
   - Delete others (or mark as duplicate in a cleanup job)
2. **For artifacts**: Use title-based deduplication
   - Query for artifacts with duplicate `(ticket_pk, agent_type, title)`
   - Keep the one with most recent `created_at` and non-empty `body_md`
   - Delete empty/placeholder duplicates
   - Update remaining artifact with latest content if needed
3. **Prevention**: Ensure idempotency checks run **before** insert, not after

### Scenario 2: Artifact Insert Retried (Network Flap)

**Symptom**: Same artifact insert is attempted multiple times due to network retries.

**Response**:
1. **Idempotency key**: Use `(ticket_pk, agent_type, title)` as natural idempotency key
2. **Query-then-update pattern**:
   - Before insert, query for existing artifact
   - If exists, update it (do not insert)
   - If not exists, insert
3. **Handle duplicate key errors**:
   - On PostgreSQL `23505` (unique constraint violation), query for the newly created artifact
   - Update it with latest content
   - This handles race conditions where two processes insert simultaneously

### Scenario 3: Network Flaps Cause Message Replays

**Symptom**: Messages appear multiple times in the UI after reconnect.

**Response**:
1. **Client-side deduplication**:
   - Before adding message to UI, check if message with same `id` (sequence) already exists
   - Skip adding if duplicate found
2. **Sequence tracking**:
   - Maintain `agentSequenceRefs` to track max sequence per conversation
   - Only insert messages with `sequence > currentMaxSeq`
   - Update sequence tracking after successful insert
3. **UI rendering**:
   - Use message `id` (sequence) as React key to prevent duplicate rendering
   - Filter duplicate messages in render logic if needed

### Scenario 4: Supabase Unavailable on Reconnect

**Symptom**: Cannot load conversations from Supabase, but localStorage has data.

**Response**:
1. **Fallback to localStorage**:
   - Use `loadConversationsFromStorage(projectName)` to load conversations
   - Show conversations immediately from localStorage
   - Display a warning/error indicator that Supabase is unavailable
2. **Continue saving to localStorage**:
   - All new messages/state changes save to localStorage
   - When Supabase becomes available, sync localStorage → Supabase
3. **Sync strategy**:
   - On Supabase reconnect, load from Supabase and merge with localStorage
   - Supabase takes precedence (overwrites localStorage conflicts)
   - Then sync any localStorage-only messages to Supabase

### Scenario 5: Partial State Restored (Some Conversations Missing)

**Symptom**: After reconnect, some conversations are missing from the UI.

**Response**:
1. **Verify Supabase query**:
   - Ensure query includes all agents/conversation IDs
   - Check for filtering that might exclude valid conversations
2. **Check localStorage**:
   - Load from localStorage as backup
   - Merge with Supabase data (Supabase takes precedence)
3. **Ensure default conversations**:
   - Always ensure PM conversation (`project-manager-1`) exists
   - Create empty conversation if missing
4. **Log diagnostics**:
   - Log which conversations were loaded from Supabase vs localStorage
   - Log any errors during load process

## Verification Procedure

A human can follow these steps in the HAL UI to verify that the SOP is being followed correctly:

### Test 1: Basic Reconnect (No Duplicates)

1. **Setup**:
   - Open HAL app and connect to a project
   - Start a conversation with an agent (e.g., PM agent)
   - Send 2-3 messages and wait for responses
   - Verify messages appear in the UI

2. **Disconnect**:
   - Click "Disconnect" button
   - Verify conversations disappear from UI (but remain in localStorage)

3. **Reconnect**:
   - Click "Connect" and select the same project folder
   - Wait for conversations to load

4. **Verify**:
   - ✅ All previous messages appear exactly once (no duplicates)
   - ✅ Conversation list shows the same conversations as before disconnect
   - ✅ Selected conversation is restored (if one was selected)
   - ✅ No blank/empty artifacts were created during reconnect
   - ✅ Console shows no duplicate insert errors

### Test 2: Reconnect with Network Interruption

1. **Setup**:
   - Open HAL app and connect to a project
   - Start a conversation and send a message
   - While message is being sent, disconnect network (or close Supabase connection)

2. **Reconnect Network**:
   - Restore network connection
   - Wait for Supabase to reconnect

3. **Verify**:
   - ✅ Message appears exactly once (not duplicated from retry)
   - ✅ No duplicate artifacts created
   - ✅ Sequence numbers are sequential (no gaps or duplicates)

### Test 3: Multiple Rapid Reconnects

1. **Setup**:
   - Open HAL app and connect to a project
   - Start a conversation and send a message

2. **Rapid Reconnect**:
   - Disconnect and immediately reconnect (repeat 3-5 times quickly)

3. **Verify**:
   - ✅ Final state shows messages exactly once
   - ✅ No duplicate conversations in the list
   - ✅ No blank artifacts created
   - ✅ Console shows no errors about duplicate keys

### Test 4: Artifact Creation During Reconnect

1. **Setup**:
   - Open HAL app and connect to a project
   - Ask an agent to create an artifact (e.g., "Create a plan for ticket 0177")

2. **Interrupt and Reconnect**:
   - While artifact is being created, disconnect
   - Immediately reconnect

3. **Verify**:
   - ✅ Artifact appears exactly once in Supabase (check via HAL app Artifacts view)
   - ✅ Artifact has content (not blank/placeholder)
   - ✅ No duplicate artifacts with same title
   - ✅ Artifact is associated with correct ticket

### Test 5: Supabase Unavailable Fallback

1. **Setup**:
   - Open HAL app and connect to a project
   - Send messages in a conversation

2. **Simulate Supabase Failure**:
   - Disconnect from project
   - Modify Supabase credentials to be invalid (or disconnect Supabase)
   - Reconnect to project

3. **Verify**:
   - ✅ Conversations load from localStorage (appears immediately)
   - ✅ Warning/error indicator shows Supabase is unavailable
   - ✅ New messages can still be sent (saved to localStorage)
   - ✅ When Supabase is restored, messages sync correctly

### Expected Console Output (No Errors)

During all tests, the console should show:
- ✅ No `duplicate key` errors (PostgreSQL `23505`)
- ✅ No `Failed to insert` errors for artifacts
- ✅ No `Failed to save messages` errors
- ✅ Warnings about skipped duplicates are acceptable (indicates idempotency working)

### Red Flags (Indicates SOP Not Being Followed)

- ❌ Duplicate messages in UI after reconnect
- ❌ Multiple artifacts with same title for same ticket
- ❌ Blank/placeholder artifacts in database
- ❌ Console errors about duplicate key violations
- ❌ Conversations missing after reconnect (when they should exist)
- ❌ Messages out of order or with duplicate sequence numbers

## Implementation References

- **Message persistence**: `src/App.tsx` lines 1409-1487 (conversation persistence effect)
- **Message deduplication**: `src/App.tsx` lines 1642-1645 (client-side dedup)
- **Artifact insertion**: `vite.config.ts` lines 38-165 (`insertAgentArtifact` function)
- **Artifact validation**: `api/artifacts/_validation.ts` (content validation)
- **localStorage helpers**: `src/App.tsx` lines 148-200 (conversation storage helpers)
- **Reconnect flow**: `src/App.tsx` lines 626-950 (project connection and conversation restoration)

## Related Tickets

- **HAL-0097**: Fix empty PM chat after reconnect (localStorage persistence)
- **HAL-0121**: Prevent blank/placeholder artifacts (validation before insert)
- **HAL-0124**: Save all conversations to Supabase (not just PM)
- **HAL-0153**: Prevent duplicate messages (client-side deduplication)
