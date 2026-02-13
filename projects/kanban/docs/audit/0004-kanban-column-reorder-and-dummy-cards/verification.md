# Verification (0004-kanban-column-reorder-and-dummy-cards)

All checks are done **in the browser only**. No terminal, devtools, or console.

## Prerequisites
1. In the project folder, run: `npm install` then `npm run dev`.
2. Open the URL shown (e.g. http://localhost:5173/) in a browser.

---

## Step 1: Add columns and verify dummy cards
- **Action:** Click **Add column**, create at least 2 columns (e.g. "Todo", "In Progress").
- **Check:** Each column displays **at least 3 dummy ticket cards** (e.g. "Dummy task A", "Dummy task B", "Dummy task C") with readable spacing.
- **Pass:** You see 3 cards per column with visible backgrounds/borders and spacing between them.

---

## Step 2: Column reorder via drag-and-drop
- **Action:** Drag a column (by its title) left or right to a new position and drop.
- **Check:** After dropping, the columns appear in the **new order immediately**.
- **Pass:** The column order updates to match where you dropped it; no page refresh needed.

---

## Step 3: Debug panel — Column order
- **Action:** Open the Debug panel (click **Debug** so it shows **Debug ON**).
- **Check:** The **Kanban state** section includes "Column order: A → B → C" (or similar with your column names and → arrows).
- **Pass:** You can read the current column order and confirm it matches the visible order after reordering.

---

## Step 4: Action Log — Reorder entry
- **Action:** Reorder a column (drag to a new position), then check the Action Log in the Debug panel.
- **Check:** The Action Log shows a clear entry such as `Columns reordered: Todo,In Progress -> In Progress,Todo` (or similar with your column names).
- **Pass:** A reorder produces a single, readable log entry with old and new order.

---

## Summary
- If all four steps pass, the deliverable is verified.
- If any step fails, note which step and what you saw (e.g. "Step 2: column did not move after drop" or "Step 4: no reorder entry in Action Log").
