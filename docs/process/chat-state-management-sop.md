# Chat state management SOP (disconnect/reconnect)

**Purpose:** This SOP defines how agents must handle chat state during disconnect/reconnect scenarios to prevent duplicate messages, duplicate artifacts, blank "shell" artifacts, and ensure consistent state recovery.

## Authoritative sources of truth

### Conversation state

**Primary source of truth:** `hal_conversation_messages` table in Supabase
- **Location:** `src/App.tsx:616-820` — `loadConversationsForProject()` function
- Messages are stored with `project_id`, `agent` (conversation ID), `sequence` (message ID), `role`, `content`, `created_at`
- Conversation IDs follow format: `{agent-role}-{instanceNumber}` (e.g., `project-manager-1`, `implementation-agent-2`)

**Secondary source (fallback):** `localStorage` (`hal-chat-conversations-{projectName}`)
- **Location:** `src/App.tsx:226-255` — `loadConversationsFromStorage()` function
- Used for immediate UI display on reconnect before Supabase loads
- **Ephemeral:** Supabase data always takes precedence when available

**Ephemeral (do not rely on):**
- In-memory React state (`conversations` Map in `src/App.tsx`)
- Browser session state
- Client-side message IDs that haven't been persisted

### Ticket and artifact state

**Primary source of truth:** Supabase tables
- **Tickets:** `tickets` table (via HAL API `/api/tickets/get`)
- **Artifacts:** `agent_artifacts` table (via HAL API `/api/artifacts/get`)
- **Location:** HAL API endpoints in `api/tickets/get.ts` and `api/artifacts/get.ts`

**Ephemeral (do not rely on):**
- In-memory ticket content from previous session
- Cached artifact content
- Local file system state (tickets are Supabase-only)

### Message deduplication

**Message IDs are authoritative:** Messages are deduplicated by `sequence` (message ID) within each conversation
- **Location:** `src/App.tsx:1642-1647` — `addMessage()` function checks for existing message ID
- **Database constraint:** `hal_conversation_messages` table has unique constraint on `(project_id, agent, sequence)`
- **Client-side check:** Before adding a message, check if `msg.id === nextId` already exists in conversation

### Artifact deduplication

**Artifacts are deduplicated by canonical ID:**
- **Location:** `api/artifacts/insert-implementation.ts:200-300` and `api/artifacts/insert-qa.ts:200-300`
- **Canonical ID:** `(ticket_pk, agent_type, artifact_type, canonical_title)`
- **Strategy:** Find existing artifacts by canonical ID, delete duplicates, then update or insert
- **Validation:** Artifacts must pass `hasSubstantiveContent()` check` (minimum 50 chars for implementation, 100 chars for QA)
- **Location:** `api/artifacts/_validation.ts:11-87`

## Reconnect checklist

When an agent reconnects (page refresh, network reconnect, or session restore), follow these steps **in order**:

### 1. Rehydrate conversation list and active conversation from database

**MANDATORY:** Always load conversations from Supabase first, then merge with localStorage fallback.

**Steps:**
1. **Load from localStorage (synchronously)** — `src/App.tsx:628-642`
   - Call `loadConversationsFromStorage(projectName)` to get immediate UI state
   - Ensure PM conversation exists (create empty if missing)
   - Set conversations state immediately for fast UI render

2. **Load from Supabase (asynchronously)** — `src/App.tsx:649-820`
   - Query `hal_conversation_messages` table filtered by `project_id`
   - Group messages by `agent` (conversation ID)
   - Load most recent `MESSAGES_PER_PAGE` messages per conversation (pagination)
   - Build `Conversation` objects with messages sorted by `sequence`

3. **Merge conversations** — `src/App.tsx:797-817`
   - Start with localStorage conversations (ensures all conversations visible)
   - Overwrite with Supabase data (Supabase takes precedence)
   - Ensure PM conversation exists even if no messages loaded

4. **Restore selected conversation** — `src/App.tsx:912-928`
   - Read `hal-selected-conversation-{projectName}` from localStorage
   - Set `selectedConversationId` if conversation exists in loaded conversations

**Code locations:**
- `src/App.tsx:616-820` — `loadConversationsForProject()` function
- `src/App.tsx:226-255` — `loadConversationsFromStorage()` function
- `src/App.tsx:912-928` — Restore selected conversation effect

### 2. Re-fetch ticket content and artifacts from Supabase

**MANDATORY:** Never rely on in-memory state for tickets or artifacts. Always fetch fresh data from Supabase.

**Steps:**
1. **Fetch ticket content** — Use HAL API endpoint:
   ```javascript
   const baseUrl = (await readFile('.hal/api-base-url', 'utf8')).trim()
   const res = await fetch(`${baseUrl}/api/tickets/get`, {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ ticketId: 'HAL-0177' }),
   })
   const result = await res.json()
   if (!result.success) throw new Error(result.error)
   // Use result.ticket for ticket content
   ```

2. **Fetch artifacts** — Use HAL API endpoint:
   ```javascript
   const res = await fetch(`${baseUrl}/api/artifacts/get`, {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ ticketId: 'HAL-0177' }),
   })
   const result = await res.json()
   if (!result.success) throw new Error(result.error)
   // Use result.artifacts for artifact list
   ```

3. **Do not cache:** Always fetch fresh data when starting work on a ticket, even if you "remember" the content from a previous session.

**Code locations:**
- `api/tickets/get.ts` — Ticket content endpoint
- `api/artifacts/get.ts` — Artifact list endpoint
- See `.cursor/rules/agent-instructions.mdc` for API usage examples

### 3. De-dupe on insert: messages, artifacts, and tool-call results (idempotency requirements)

**MANDATORY:** All insert operations must be idempotent. Re-running the same operation should not create duplicates.

#### Messages

**Deduplication strategy:**
- **Database constraint:** Unique constraint on `(project_id, agent, sequence)` in `hal_conversation_messages`
- **Client-side check:** Before adding message, check if message ID already exists — `src/App.tsx:1642-1647`
- **Sequence tracking:** Track max sequence per conversation in `agentSequenceRefs.current` — `src/App.tsx:1430-1460`
- **Insert only new:** Only insert messages where `sequence > currentMaxSeq` — `src/App.tsx:1433`

**If duplicate detected:**
- Skip insert (message already exists)
- Log warning if unexpected duplicate
- Continue with next message

**Code locations:**
- `src/App.tsx:1642-1647` — Client-side message deduplication
- `src/App.tsx:1430-1460` — Sequence tracking and insert filtering
- Database schema: `hal_conversation_messages` unique constraint

#### Artifacts

**Deduplication strategy:**
- **Canonical ID:** `(ticket_pk, agent_type, artifact_type, canonical_title)` — `api/artifacts/_shared.ts`
- **Find existing:** Query artifacts by canonical ID before insert — `api/artifacts/insert-implementation.ts:200-250`
- **Delete duplicates:** Remove all artifacts with same canonical ID except one — `api/artifacts/insert-implementation.ts:280-295`
- **Update or insert:** If existing artifact found, update it; otherwise insert new — `api/artifacts/insert-implementation.ts:300-370`

**If duplicate detected:**
- Delete all duplicate artifacts (keep only one)
- Update existing artifact with new content (append if needed)
- Log cleanup count in response

**Code locations:**
- `api/artifacts/insert-implementation.ts:200-400` — Implementation artifact deduplication
- `api/artifacts/insert-qa.ts:200-400` — QA artifact deduplication
- `api/artifacts/_shared.ts` — Canonical ID functions
- `api/artifacts/_validation.ts` — Content validation

#### Tool-call results

**Deduplication strategy:**
- **Ticket moves:** Idempotent by design (moving to same column is no-op)
- **Ticket updates:** Overwrite existing `body_md` (idempotent)
- **Artifact inserts:** Use artifact deduplication (see above)

**If duplicate detected:**
- For ticket moves: No-op if already in target column
- For ticket updates: Overwrite existing content
- For artifacts: Use artifact deduplication strategy

### 4. Guardrails to prevent creating blank "shell" artifacts

**MANDATORY:** All artifacts must pass content validation before insert. Reject empty or placeholder-only artifacts.

**Validation requirements:**
- **Minimum length:** 50 characters for implementation artifacts, 100 characters for QA artifacts — `api/artifacts/_validation.ts:17-22, 99-105`
- **Substantive content:** Must contain actual content, not just headings or placeholders — `api/artifacts/_validation.ts:24-87`
- **Placeholder detection:** Reject patterns like `(No files changed)`, `(none)`, `TODO`, `TBD` — `api/artifacts/_validation.ts:26-41`

**Validation checks:**
1. **Empty check:** Reject if `body_md` is empty or whitespace-only
2. **Length check:** Reject if trimmed length < 50 chars (implementation) or < 100 chars (QA)
3. **Placeholder check:** Reject if content matches placeholder patterns
4. **Heading-only check:** Reject if content is only headings with no body text
5. **Type-specific checks:** Special validation for "Changed Files" and "Verification" artifacts

**If validation fails:**
- **Reject insert:** Return 400 error with validation reason
- **Do not create artifact:** Never insert empty/placeholder artifacts
- **Log error:** Include validation failure reason in response

**Code locations:**
- `api/artifacts/_validation.ts:11-87` — `hasSubstantiveContent()` function
- `api/artifacts/_validation.ts:93-117` — `hasSubstantiveQAContent()` function
- `api/artifacts/insert-implementation.ts:100-120` — Validation before insert
- `api/artifacts/insert-qa.ts:100-120` — Validation before insert

## Failure-mode guidance

### What to do if duplicates are detected

#### Duplicate messages

**Detection:**
- Database unique constraint violation on `(project_id, agent, sequence)`
- Client-side check finds existing message with same ID

**Response:**
1. **Skip insert:** Do not insert duplicate message
2. **Log warning:** Log duplicate detection for debugging
3. **Continue:** Proceed with next message or operation
4. **No user impact:** Duplicate messages are silently skipped (user doesn't see duplicates)

**Code locations:**
- `src/App.tsx:1642-1647` — Client-side duplicate check
- Database constraint prevents duplicates at insert time

#### Duplicate artifacts

**Detection:**
- Query finds multiple artifacts with same canonical ID
- Insert fails with duplicate key error (race condition)

**Response:**
1. **Delete duplicates:** Remove all artifacts with same canonical ID except one — `api/artifacts/insert-implementation.ts:280-295`
2. **Update existing:** If existing artifact found, update it with new content (append if needed)
3. **Log cleanup:** Include `cleaned_up_duplicates` count in response
4. **Retry insert:** If insert failed due to race condition, find and update existing artifact

**Code locations:**
- `api/artifacts/insert-implementation.ts:280-400` — Duplicate cleanup and retry logic
- `api/artifacts/insert-qa.ts:280-400` — Duplicate cleanup and retry logic

#### Blank artifacts detected

**Detection:**
- Validation fails before insert (empty, too short, or placeholder-only)
- Query finds existing artifacts with empty/placeholder content

**Response:**
1. **Reject insert:** Return 400 error with validation reason — `api/artifacts/_validation.ts:11-87`
2. **Delete blank artifacts:** During duplicate cleanup, delete empty/placeholder artifacts — `api/artifacts/insert-implementation.ts:251-261`
3. **Log cleanup:** Include `cleaned_up_duplicates` count in response
4. **Require valid content:** Agent must provide substantive content before retry

**Code locations:**
- `api/artifacts/_validation.ts:11-87` — Validation functions
- `api/artifacts/insert-implementation.ts:251-261` — Blank artifact cleanup
- `api/artifacts/insert-qa.ts:251-261` — Blank artifact cleanup

### What to do if artifact insert is retried

**Retry scenarios:**
- Network error during insert
- Race condition (another process inserted same artifact)
- Transient database error

**Retry strategy:**
1. **Check for existing:** Query for existing artifact by canonical ID — `api/artifacts/insert-implementation.ts:380-420`
2. **Update if exists:** If found, update existing artifact instead of inserting new
3. **Insert if missing:** If not found, retry insert
4. **Handle duplicate key:** If insert fails with duplicate key error, treat as race condition and update existing

**Code locations:**
- `api/artifacts/insert-implementation.ts:380-420` — Race condition handling
- `api/artifacts/insert-qa.ts:380-420` — Race condition handling

### What to do if network flaps cause replays

**Scenario:** Network disconnects and reconnects, causing message/artifact inserts to be retried multiple times.

**Protection mechanisms:**
1. **Message sequence tracking:** Only insert messages with `sequence > currentMaxSeq` — `src/App.tsx:1433`
2. **Database constraints:** Unique constraints prevent duplicate inserts at database level
3. **Idempotent operations:** All insert operations are idempotent (safe to retry)

**Response:**
1. **Trust database constraints:** Database will reject duplicate inserts
2. **Track sequences:** Client tracks max sequence per conversation to avoid re-inserting old messages
3. **Deduplicate artifacts:** Artifact deduplication handles retries gracefully
4. **No user impact:** Replays are handled automatically by idempotency

**Code locations:**
- `src/App.tsx:1430-1460` — Sequence tracking prevents replay
- Database unique constraints prevent duplicates
- `api/artifacts/insert-implementation.ts:200-400` — Artifact deduplication handles retries

## Verification procedure

**Purpose:** Verify that the SOP is being followed and that reconnect scenarios work correctly without creating duplicates or blank artifacts.

### Step 1: Simulate disconnect/reconnect

1. **Open HAL app** in browser (e.g., `http://localhost:5173`)
2. **Connect to a project** (select a repo/folder)
3. **Start a conversation** with an agent (PM, Implementation, or QA)
4. **Send a few messages** to create conversation history
5. **Create an artifact** (e.g., implementation agent creates a plan artifact)
6. **Disconnect:**
   - Option A: Close browser tab, then reopen and reconnect
   - Option B: Disconnect GitHub (click "Disconnect GitHub" button), then reconnect
   - Option C: Clear browser cache/localStorage (simulate fresh session), then reconnect
7. **Reconnect** to the same project

### Step 2: Verify conversation state recovery

**Expected behavior:**
- ✅ Conversation list appears immediately (from localStorage)
- ✅ All conversations are visible (PM, Implementation, QA instances)
- ✅ Active conversation shows all previous messages (no duplicates)
- ✅ Selected conversation is restored (if you had one open before disconnect)
- ✅ Messages load from Supabase (may take a moment to load from DB)

**Check for issues:**
- ❌ Duplicate messages in conversation (same message ID appears twice)
- ❌ Missing conversations (conversations that existed before disconnect are gone)
- ❌ Blank conversation (conversation exists but has no messages when it should)
- ❌ Wrong conversation selected (different conversation is open than before disconnect)

**How to verify:**
1. Open browser DevTools → Console
2. Check for error messages about duplicate inserts or failed loads
3. Manually count messages in a conversation (should match pre-disconnect count)
4. Check `localStorage` for `hal-chat-conversations-{projectName}` (should contain conversation data)

### Step 3: Verify artifact state recovery

**Expected behavior:**
- ✅ All artifacts for a ticket are visible in ticket's Artifacts section
- ✅ No duplicate artifacts (same artifact type appears only once)
- ✅ No blank artifacts (artifacts have substantive content, not just placeholders)
- ✅ Artifact content is complete (not truncated or missing)

**Check for issues:**
- ❌ Duplicate artifacts (same artifact type appears multiple times)
- ❌ Blank artifacts (artifact exists but `body_md` is empty or placeholder-only)
- ❌ Missing artifacts (artifacts that existed before disconnect are gone)

**How to verify:**
1. Open a ticket that had artifacts before disconnect
2. Navigate to ticket's "Artifacts" section
3. Count artifacts by type (should be unique per type)
4. Open each artifact and verify it has substantive content (not empty, not just "TODO" or "(none)")
5. Check Supabase `agent_artifacts` table directly:
   ```sql
   SELECT artifact_id, ticket_pk, agent_type, artifact_type, title, 
          LENGTH(body_md) as body_length, created_at
   FROM agent_artifacts
   WHERE ticket_pk = 'HAL-0177'
   ORDER BY created_at;
   ```
6. Verify no duplicate `(ticket_pk, agent_type, artifact_type, canonical_title)` combinations

### Step 4: Verify idempotency

**Test:** Re-run the same operation multiple times (simulate retry/network flap).

**Expected behavior:**
- ✅ Inserting the same message twice creates only one message
- ✅ Inserting the same artifact twice creates/updates only one artifact
- ✅ Moving a ticket to the same column is a no-op (no error)
- ✅ Updating a ticket with the same content is idempotent (no error)

**How to verify:**
1. **Message idempotency:**
   - Send a message in chat
   - Refresh page (reconnect)
   - Verify message appears only once (not duplicated)
2. **Artifact idempotency:**
   - Create an artifact (e.g., plan artifact)
   - Call artifact insert API again with same content
   - Verify only one artifact exists (duplicate was cleaned up or updated)
3. **Ticket move idempotency:**
   - Move ticket to "QA" column
   - Move ticket to "QA" column again (same column)
   - Verify no error and ticket remains in "QA" column

### Step 5: Verify validation prevents blank artifacts

**Test:** Attempt to create an artifact with empty or placeholder content.

**Expected behavior:**
- ✅ Insert is rejected with 400 error
- ✅ Error message explains validation failure (e.g., "Artifact body is too short")
- ✅ No artifact is created in database
- ✅ Blank artifacts are cleaned up if they exist

**How to verify:**
1. Call artifact insert API with empty `body_md`:
   ```javascript
   const res = await fetch(`${baseUrl}/api/artifacts/insert-implementation`, {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({
       ticketId: 'HAL-0177',
       artifactType: 'plan',
       title: 'Plan for ticket HAL-0177',
       body_md: '', // Empty content
     }),
   })
   const result = await res.json()
   // Should return: { success: false, error: "body_md must be a non-empty string..." }
   ```
2. Verify no artifact was created in `agent_artifacts` table
3. Try with placeholder content (e.g., `body_md: "(none)"` or `body_md: "TODO"`)
4. Verify insert is rejected with validation error

### Step 6: Check logs for errors

**Check browser console and server logs for:**
- ❌ Duplicate key errors (should be handled gracefully)
- ❌ Failed message inserts (should retry or skip)
- ❌ Failed artifact inserts (should return validation error, not create blank artifact)
- ❌ Conversation load failures (should fall back to localStorage)

**Expected logs (normal operation):**
- `[HAL] Loading conversations from localStorage...`
- `[HAL] Loading conversations from Supabase...`
- `[insert-implementation] Artifact creation request: ticketId=...`
- `[insert-implementation] Inserting new artifact...` or `[insert-implementation] Appending to artifact...`

**Error logs (investigate if seen):**
- `[HAL] Failed to save messages for conversation...` (should fall back to localStorage)
- `[insert-implementation] Insert failed: duplicate key` (should be handled by retry logic)
- `[insert-implementation] Validation failed: ...` (expected for blank artifacts, should reject)

## Summary

**Key principles:**
1. **Supabase is authoritative** — Always load from database, never rely on in-memory state
2. **Idempotency is mandatory** — All inserts must be safe to retry
3. **Validation prevents blanks** — Reject empty/placeholder artifacts before insert
4. **Deduplication is automatic** — Database constraints and client-side checks prevent duplicates
5. **localStorage is fallback** — Used for immediate UI, but Supabase takes precedence

**When in doubt:**
- **Fetch fresh data** from Supabase (don't trust cached state)
- **Check for existing** before inserting (messages, artifacts, etc.)
- **Validate content** before inserting artifacts (reject empty/placeholder)
- **Trust database constraints** (they prevent duplicates at the source)
