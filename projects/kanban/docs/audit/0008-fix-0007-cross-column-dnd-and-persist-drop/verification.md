# Verification (0008-fix-0007-cross-column-dnd-and-persist-drop)

All checks are done **in the browser only**. No terminal, devtools, or console.

## Prerequisites
1. In the project folder, run: `npm install` then `npm run dev`.
2. Open the URL shown (e.g. http://localhost:5173/) in a browser.

---

## Step 1: Reorder within column persists
- **Action:** With default columns visible, drag a dummy card **within To-do** to a new position (e.g. Card B below Card C). Drop it.
- **Check:** The new order **persists** (e.g. To-do shows Card A, Card C, Card B). The order does **not** revert immediately.
- **Pass:** In-column reorder persists.

---

## Step 2: Move from To-do to Doing
- **Action:** Drag a card from **To-do** into **Doing** and drop it.
- **Check:** The card is now visible in **Doing** and no longer in To-do.
- **Pass:** Cross-column move To-do → Doing works.

---

## Step 3: Move from Doing to Done
- **Action:** Drag a card from **Doing** into **Done** and drop it.
- **Check:** The card is now in **Done** and stays there.
- **Pass:** Cross-column move Doing → Done works.

---

## Step 4: Debug — Kanban state updates after drop
- **Action:** Open **Debug** (Debug ON). In **Kanban state**, look at "Cards per column". Perform a reorder or move. Check the text again.
- **Check:** "Cards per column" updates **immediately** after each drop to reflect the new per-column card order (so a human can verify without external tools).
- **Pass:** Kanban state in Debug reflects drops.

---

## Step 5: Action log — one entry per drop
- **Action:** Perform one **reorder within column** and one **move across columns**. Check the **Action Log** in the Debug panel.
- **Check:** There is **one entry per successful drop**. Reorder entry includes column name + before/after order. Move entry includes from/to column + before/after orders.
- **Pass:** Action log records reorder and move with required detail.

---

## Summary
- If all five steps pass, the deliverable is verified.
- If any step fails, note which step and what you saw.
