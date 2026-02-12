# Verification (0015-fix-column-layout-horizontal-row)

All checks are done **in the browser only**. No terminal, devtools, or console.

## Prerequisites
1. In the project folder: `npm install` then `npm run dev`.
2. Open the app in a browser.
3. Ensure Project = **hal-kanban** and the board is visible (Supabase connected or default columns).

---

## Step 1: Columns in one horizontal row
- **Action:** Load the app with Project = hal-kanban. Look at the Columns section.
- **Check:** **To-do**, **Doing**, and **Done** (or your column titles) appear on the **same horizontal row** — side-by-side, not stacked vertically.
- **Pass:** All columns are in one row.

---

## Step 2: Narrow window – row-based with horizontal scroll
- **Action:** Make the browser window narrow (e.g. reduce width so columns would not all fit).
- **Check:** Columns **remain side-by-side** in one row; the board **scrolls horizontally** (e.g. scrollbar or swipe) so you can see all columns. Layout is clearly row-based, not vertical stack.
- **Pass:** Narrow view shows horizontal scroll; no vertical stacking of columns.

---

## Step 3: Drag-and-drop still works
- **Action:** Drag a card from one column and drop it into another.
- **Check:** The card moves to the target column; order/state update as before.
- **Pass:** DnD between columns works; no regression.

---

## Step 4: Debug panel – per-column ticket IDs and polling
- **Action:** Open **Debug** (Debug toggle). Find **Kanban state** and **Ticket Store (Supabase)** (if connected).
- **Check:** You see **Column count**, **Column order**, **Cards per column**, and **Per-column ticket IDs**. If Supabase is connected, polling info and per-column ticket IDs are still shown.
- **Pass:** Debug panel shows per-column ticket IDs and polling info; no regressions.

---

## Summary
- If steps 1–4 pass, the deliverable is verified.
- If any step fails, note which step and what you saw.
