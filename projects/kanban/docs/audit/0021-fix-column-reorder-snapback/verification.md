# Verification (0021-fix-column-reorder-snapback)

All checks are done **in the browser only**. No terminal, devtools, or console after starting the dev server.

## Prerequisites
1. In the project folder, run: `npm install` then `npm run dev`.
2. Open the URL shown (e.g. http://localhost:5173/) in a browser.

---

## Step 1: Column reorder (no snap-back)
- **Mode:** Use a mode where column reordering is allowed: either **local columns** (do not connect Ticket Store or Supabase) or **Docs Ticket Store** (connect project folder with docs/tickets). Do **not** use Supabase board (fixed To-do/Doing/Done).
- **Action:** Add at least two columns if needed. Drag a column header left or right to a new position and drop.
- **Check:** The column stays in the new position and **does not snap back** after drop.
- **Pass:** The visible column order matches the drop position and remains stable.

---

## Step 2: Action Log — reorder or skip
- **Action:** Open **Debug** (Debug ON), then open the **Action Log** section.
- **Check:** After a successful column reorder, the log shows an entry like `Columns reordered: A,B,C -> B,A,C`. If a reorder was skipped (e.g. drop target unresolved), the log shows a clear message such as "Column reorder skipped: drop target could not be resolved to a column".
- **Pass:** You can confirm reorder success or explain a skip from the in-app log alone.

---

## Step 3: Smoke — card DnD
- **Action:** Drag a ticket card from one column to another (or reorder within a column).
- **Check:** Card move/reorder still works; no regression.
- **Pass:** Cards move and stay where dropped; no snap-back for cards.

---

## Step 4: Persistence (if applicable)
- **Action:** If column order is persisted in the current mode (e.g. future Supabase columns or docs store), refresh the page or trigger a poll/refresh.
- **Check:** Column order remains after refresh.
- **Note:** For local-only or current docs ticket store, column order may reset on refresh (persistence is out of scope for 0021). Step 4 is only required when the current mode actually persists column order.

---

## Summary
- Steps 1–3 must pass for the deliverable to be verified.
- Step 4 applies only when the app persists column order in the mode you are testing.
- If any step fails, note which step and what you saw (e.g. "Step 1: column snapped back after drop" or "Step 2: no reorder entry in Action Log").
