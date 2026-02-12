# Verification (0007-dnd-dummy-cards-and-default-columns)

All checks are done **in the browser only**. No terminal, devtools, or console.

## Prerequisites
1. In the project folder, run: `npm install` then `npm run dev`.
2. Open the URL shown (e.g. http://localhost:5173/) in a browser.

---

## Step 1: Default columns on first load
- **Action:** Load the app (no prior columns created).
- **Check:** The board shows exactly **3 columns** titled **To-do**, **Doing**, **Done**.
- **Pass:** Three columns visible with those titles.

---

## Step 2: Dummy cards and spacing
- **Action:** Look at each column.
- **Check:** Each column shows **at least 3 dummy cards** (e.g. Card A/B/C in To-do, Card D/E/F in Doing, Card G/H/I in Done) with readable spacing.
- **Pass:** Three cards per column; no overlap.

---

## Step 3: Reorder card within column
- **Action:** Drag a dummy card **within the same column** (e.g. Card B below Card C in To-do). Drop it.
- **Check:** The card’s order in that column **changes immediately** after drop (e.g. order becomes A, C, B).
- **Pass:** In-column reorder works.

---

## Step 4: Move card to another column
- **Action:** Drag a dummy card **to a different column** (e.g. Card A from To-do into Doing). Drop it.
- **Check:** The card **moves to the target column** and appears there immediately after drop.
- **Pass:** Cross-column move works.

---

## Step 5: Debug — Kanban state
- **Action:** Open **Debug** (Debug ON). In **Kanban state**, look at "Column order" and "Cards per column".
- **Check:** **Column order** shows the current column order (e.g. To-do → Doing → Done). **Cards per column** shows per-column card titles in order (e.g. `To-do: Card A,Card B,Card C | Doing: ... | Done: ...`). After moves, the text updates to match the board.
- **Pass:** Column order and card titles per column are visible and correct.

---

## Step 6: Action log — reorder and move
- **Action:** After doing a **reorder** (Step 3) and a **move** (Step 4), check the **Action Log** in the Debug panel.
- **Check:** There is a **clear entry for card reorder** within a column (e.g. mentions "Card reordered in …" and old/new order). There is a **clear entry for moving a card** between columns (e.g. "Card moved from … (pos …) to … (pos …)" with old and new location/order).
- **Pass:** Both reorder and move are logged with location/order info.

---

## Summary
- If all six steps pass, the deliverable is verified.
- If any step fails, note which step and what you saw.
