# Verification (0016-widen-board-remove-columns-heading)

All checks are done **in the browser only**. No terminal, devtools, or console.

## Prerequisites
1. In the project folder: `npm install` then `npm run dev`.
2. Open the app in a browser.
3. Ensure Project = **hal-kanban** and the board is visible (Supabase connected or default columns).

---

## Step 1: Board uses full width
- **Action:** Load the app with Project = hal-kanban. Look at the overall page layout.
- **Check:** The page content is **not** constrained to a narrow centered strip. The board area uses **most of the viewport width** (reasonable side margins from padding are fine).
- **Pass:** Board spans full width (or nearly full width with margins).

---

## Step 2: At least 4 columns fit comfortably
- **Action:** With a normal or wide browser window and Project = hal-kanban, view the board.
- **Check:** The visible board has **enough horizontal space** to show **at least 4 columns** comfortably (e.g. To-do, Doing, Done, plus one more if added). On very small screens, horizontal scroll is acceptable.
- **Pass:** At least 4 columns worth of space is visible without feeling cramped.

---

## Step 3: "Columns" heading is gone
- **Action:** Look at the board section (where the column cards and "Add column" appear).
- **Check:** There is **no** visible "Columns" heading or title above the columns. The board still shows column cards and cards inside them as before.
- **Pass:** "Columns" heading is not shown; columns and cards render normally.

---

## Step 4: Drag-and-drop still works
- **Action:** Drag a card from one column and drop it into another.
- **Check:** The card moves to the target column; order/state update as before.
- **Pass:** DnD between columns works; no regression.

---

## Step 5: Debug panel still works
- **Action:** Open **Debug** (Debug toggle). Inspect Kanban state and Ticket Store (if connected).
- **Check:** Debug panel shows expected content (column count, cards, polling, etc.).
- **Pass:** Debug panel works; no regression.

---

## Summary
- If steps 1–5 pass, the deliverable is verified.
- If any step fails, note which step and what you saw.
