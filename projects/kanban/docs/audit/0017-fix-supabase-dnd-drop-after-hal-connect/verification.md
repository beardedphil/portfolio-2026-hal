# Verification (0017-fix-supabase-dnd-drop-after-hal-connect)

All checks are done **in the browser only**. No terminal, devtools, or console.

## Prerequisites
1. In the project folder: `npm install` then `npm run dev`.
2. Open the app in a browser.
3. A Supabase project with the `tickets` table and at least one ticket (e.g. in Unassigned or To-do).

---

## Step 1: Connect via HAL (or folder picker)

### Option A: HAL embedding
- **Action:** Embed the app in HAL (or simulate: postMessage `{ type: 'HAL_CONNECT_SUPABASE', url: '...', key: '...' }` from parent). Ensure the app shows **Connected** and tickets load.
- **Check:** Board shows tickets in columns; connection status is Connected.

### Option B: Folder picker (non-HAL)
- **Action:** Click **Connect Project Folder**, select a folder with `.env` containing `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- **Check:** Board shows tickets; connection status is Connected.

---

## Step 2: Drag ticket Unassigned → To-do
- **Action:** Open **Debug** (Debug toggle) so you can see the Action Log. Drag a ticket from **Unassigned** into **To-do** and drop.
- **Check:**
  - The card appears in **To-do** immediately after drop.
  - Action log shows: `Supabase ticket \<id\> moved to To-do`.
- **Pass:** Card in To-do; success message in Action Log.

---

## Step 3: Persist after poll/refresh
- **Action:** Wait for the next poll (up to ~10s) or refresh the page. Reconnect if needed.
- **Check:** The ticket **remains** in To-do (no snap-back to Unassigned).
- **Pass:** Ticket stays in To-do.

---

## Step 4: Failure diagnostics (optional)
- **Action:** Disconnect (or use a bad key), then try to drag a ticket into a column.
- **Check:** Action log shows a clear error message (e.g. "Supabase ticket X move failed: \<actual error text\>"), not just "failed".
- **Pass:** Error message is descriptive.

---

## Step 5: Regression – non-HAL flow
- **Action:** Connect via **Connect Project Folder** (not HAL). Drag a ticket between columns.
- **Check:** Ticket moves and persists; Action log shows success.
- **Pass:** DnD works when connecting via folder picker.

---

## Summary
- If steps 1–5 pass, the deliverable is verified.
- If any step fails, note which step and what you saw.
