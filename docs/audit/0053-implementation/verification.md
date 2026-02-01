# Verification (UI-only): 0053 - Implementation Agent automatically moves ticket from To Do to Doing

## Setup

1. Ensure a ticket exists in **To Do** column (e.g., create a new ticket via PM agent and move it to To Do, or use an existing ticket).
2. Ensure the project is connected (Supabase credentials in .env).
3. Ensure Cursor API is configured (`CURSOR_API_KEY` in .env).

## Test Case 1: Move from To Do to Doing (happy path)

1. **Action**: Select "Implementation Agent" in the agent dropdown.
2. **Action**: Type "Implement ticket XXXX" (where XXXX is a ticket ID that is currently in **To Do**).
3. **Action**: Click Send.
4. **Verify**: Within a few seconds, the ticket card **visibly moves** from the **To Do** column to the **Doing** column on the Kanban board.
5. **Verify**: The Implementation Agent run continues (status shows "Fetching ticket", "Resolving repo", "Launching", etc.).
6. **Verify**: Refresh the page (F5). The ticket **remains** in the **Doing** column (move persisted to Supabase).

## Test Case 2: No backwards move (ticket already in Doing)

1. **Action**: Move a ticket to **Doing** manually (or use a ticket already in Doing).
2. **Action**: Select "Implementation Agent" and type "Implement ticket XXXX" (same ticket).
3. **Action**: Click Send.
4. **Verify**: The ticket **does not move** (stays in Doing). The Implementation Agent run proceeds normally.

## Test Case 3: No backwards move (ticket in QA or later)

1. **Action**: Use a ticket that is in **QA** or **Human in the Loop** or **Done**.
2. **Action**: Select "Implementation Agent" and type "Implement ticket XXXX" (same ticket).
3. **Action**: Click Send.
4. **Verify**: The ticket **does not move backwards** (stays in its current column). The Implementation Agent run proceeds normally.

## Test Case 4: Error handling (DB write fails)

1. **Setup**: Temporarily break Supabase connection (e.g., invalid `SUPABASE_ANON_KEY` in .env, or disconnect network).
2. **Action**: Select "Implementation Agent" and type "Implement ticket XXXX" (ticket in To Do).
3. **Action**: Click Send.
4. **Verify**: An **in-app error message** appears in the Implementation Agent chat: "[Implementation Agent] Failed to move ticket to Doing: <error details>. The ticket remains in To Do."
5. **Verify**: The ticket **remains in To Do** on the Kanban board.
6. **Verify**: The Implementation Agent run **does not proceed** (no cloud agent launched).

## Test Case 5: Persistence across refresh

1. **Action**: Follow Test Case 1 (move from To Do to Doing).
2. **Action**: Wait for the ticket to move to Doing.
3. **Action**: Refresh the page (F5) before the Implementation Agent run completes.
4. **Verify**: The ticket **remains in Doing** after refresh (move persisted to Supabase, not just optimistic UI).
