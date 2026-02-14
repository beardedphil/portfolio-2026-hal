# Ticket Template (Workspace Standard)

Create a new file at `docs/tickets/<task-id>-<short-title>.md` using this template.

## Ticket

- **ID**: `<task-id>`
- **Title**: `<task-id> — <short title>` (ID prefix is automatically enforced; do not include manually)
- **Owner**: Implementation agent
- **Type**: Feature / Bug / Chore
- **Priority**: P0 / P1 / P2

## Linkage (for tracking)

- **Fixes**: `<ticket-id>` (required for bugfix tickets)
- **Category**: DnD / State / CSS / Build / Process / Other (required for bugfix tickets)

## Human in the Loop

- After QA merges, the ticket moves to **Human in the Loop**. The user tests at http://localhost:5173 — the dev server always serves `main`, so merged work is immediately testable.

## Goal (one sentence)

<what we want to achieve>

## Human-verifiable deliverable (UI-only)

<Describe exactly what a non-technical human will see/click in the UI.>

## Acceptance criteria (UI-only)

- [ ] <AC 1>
- [ ] <AC 2>
- [ ] <AC 3>

## Constraints

- Keep this task as small as possible while still producing a **human-verifiable** UI change.
- Verification must require **no external tools** (no terminal, no devtools, no console).
- Add/extend **in-app** diagnostics as needed so failures are explainable from within the app.

## Non-goals

- <explicitly out of scope>

## Implementation notes (optional)

- <hints, suspected cause, suggested approach>

## Verification checklist (for chat-related work)

When working on chat-related features or fixes, verify chat persistence across disconnect/reconnect to prevent regression in HAL-0097:

### Chat persistence after disconnect/reconnect

1. **Start a chat**: Connect to a repository and start a conversation with any agent (e.g., Project Manager, Implementation Agent, or QA Agent). Send at least 2-3 messages to establish a conversation history.
2. **Disconnect/reconnect**: Click the "Disconnect" button, then reconnect to the same repository (or refresh the page if testing page refresh behavior).
3. **Verify thread and messages remain visible**: 
   - The chat preview should remain visible in the chat preview stack
   - Opening the chat should show the existing conversation history (not empty/new)
   - **Expected**: Same thread ID, message count unchanged, all previous messages visible
4. **Send a new message after reconnect**: Send a new message in the reconnected chat.
5. **Verify no duplicates/blank messages appear**:
   - **Expected**: No duplicate chat threads created
   - **Expected**: No empty message shells or blank messages
   - **Expected**: New message appears correctly in the conversation flow

**Expected UI results**:
- ✅ Same thread ID (conversation continues without creating a new thread)
- ✅ Message count unchanged (all previous messages remain visible)
- ✅ No empty shells (no blank message bubbles or placeholders)
- ✅ New messages append correctly after reconnect
- ✅ No duplicate messages or threads created

**When to use**: Apply this checklist when working on any chat-related features, UI changes to the chat component, or state management that could affect conversation persistence.

**Reference**: This checklist prevents regression of HAL-0097 (Preserve chats across disconnect/reconnect).

## Audit artifacts required (implementation agent)

Create `docs/audit/<task-id>-<short-title>/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)
