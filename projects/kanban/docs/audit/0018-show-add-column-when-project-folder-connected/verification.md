# Verification (0018-show-add-column-when-project-folder-connected)

All checks are done **in the browser only**. No terminal, devtools, or console.

## Prerequisites
1. In the project folder: `npm install` then `npm run dev`.
2. Open the app in a browser.
3. For Ticket Store: have a folder that contains `docs/tickets` (e.g. this repo or any project with ticket markdown files). Do **not** connect via "Connect Project Folder" (Supabase) for steps that use Ticket Store; or disconnect Supabase first so the board is not Supabase-driven.

---

## Step 1: Connect project folder (Ticket Store)
- **Action:** Open **Debug** (click Debug toggle). In the **Ticket Store** section, click **Connect Ticket Store (docs)**. In the file picker, select a project folder that has `docs/tickets` (e.g. the repo root). Dismiss the picker if needed; ensure "Connected: true" appears under Ticket Store in Debug.
- **Check:** Ticket Store shows Connected: true; the main board (Columns section) shows the Ticket Store columns (e.g. Unassigned, To-do, Doing, Done) if any tickets exist.
- **Pass:** Ticket Store is connected and board reflects docs/tickets.

---

## Step 2: Add column button visible
- **Action:** With Ticket Store connected (and Supabase **not** connected, so board is docs-driven), look at the Columns section.
- **Check:** The **Add column** button is visible (same row as the column cards).
- **Pass:** Add column button is visible when Ticket Store is connected.

---

## Step 3: Add column form and create
- **Action:** Click **Add column**. Enter a column name (e.g. "Backlog"). Click **Create**.
- **Check:** The form appears when clicking Add column; after Create, the new column appears on the board immediately as a new column card.
- **Pass:** Form works and new column is visible on the board.

---

## Step 4: Smoke – column remove/reorder (when applicable)
- **Action:** With Ticket Store connected, if column remove is shown: try removing a column (or reordering by drag) if the UI allows it. With Supabase connected, confirm Add column is **not** visible and board is fixed To-do/Doing/Done.
- **Check:** No regressions: remove/reorder behave as before; Supabase mode still hides Add column.
- **Pass:** Existing behaviors unchanged; Supabase board unchanged.

---

## Summary
- If steps 1–4 pass, the deliverable is verified.
- If any step fails, note which step and what you saw.
