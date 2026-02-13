# Verification (0010-kanban-dnd-docs-tickets-and-write-frontmatter)

All checks are done **in the browser only**. No terminal, devtools, or console.

## Prerequisites
1. In the project folder: `npm install` then `npm run dev`.
2. Open the app in a browser that supports the File System Access API with readwrite (e.g. Chrome, Edge).
3. Have a project folder that contains `docs/tickets/*.md` (e.g. this repo).

---

## Step 1: Connect and see columns + tickets list
- **Action:** Click **Connect project**. Select the project root (folder that contains `docs/tickets/`). Confirm.
- **Check:** Status is **Connected**. You see the **Columns** section with **To-do**, **Doing**, **Done** (and no "Add column" button). You see the **Tickets (Docs)** section with "Found N tickets." and a list of ticket filenames. Tickets that have frontmatter with `kanbanColumnId` (col-todo/col-doing/col-done) appear as cards in those columns.
- **Pass:** Both Kanban columns and Tickets list visible; tickets with frontmatter appear in the correct columns.

---

## Step 2: Drag ticket from list into To-do
- **Action:** Drag a ticket from the Tickets list (one that is not yet in a column, or use Refresh first) and drop it into the **To-do** column.
- **Check:** The ticket appears as a card inside To-do immediately after drop. An in-app status like **"Saved to file: docs/tickets/xxx.md"** appears (green).
- **Pass:** Card in To-do and "Saved to file" shown.

---

## Step 3: Drag same ticket To-do → Doing
- **Action:** Drag that ticket from **To-do** and drop it into **Doing**.
- **Check:** The card moves to Doing and stays there. "Saved to file" appears again. Open **Debug** and select that ticket in the list (click it); in **Selected ticket frontmatter** you see `kanbanColumnId` updated to `col-doing` and `kanbanMovedAt` with a newer timestamp.
- **Pass:** Card in Doing; Saved; Debug shows updated kanbanColumnId and kanbanMovedAt.

---

## Step 4: Reorder two tickets within same column
- **Action:** In one column that has at least two tickets, drag one ticket above or below another and drop.
- **Check:** Order persists after drop. "Saved to file" appears for the affected ticket(s). In Debug, for each ticket in that column, **Selected ticket frontmatter** shows `kanbanPosition` reflecting the new order (0, 1, ...).
- **Pass:** Order persists; Debug shows correct kanbanPosition; Saved confirmation.

---

## Step 5: Refresh and reconnect
- **Action:** Refresh the page. Click **Connect project** and select the same project folder again.
- **Check:** Tickets automatically appear in the column indicated by their frontmatter. Within each column, tickets are ordered by `kanbanPosition`.
- **Pass:** Placement and order match frontmatter after reconnect.

---

## Step 6: Write failure (optional)
- **Action:** If possible, trigger a write failure (e.g. connect to a folder, then in the OS revoke the app’s permission or make the file read-only). Drag a ticket into a column or move between columns.
- **Check:** The UI shows a clear in-app error (e.g. "Write error: ..."). The card does **not** stay in the new column (revert). In Debug, **Last write error** shows the error.
- **Pass:** Error visible in-app; card reverted; Debug records last write error.

---

## Step 7: Debug — selected ticket frontmatter and write status
- **Action:** With a ticket selected (click a ticket in the list), open **Debug**. Find **Ticket Store** and **Selected ticket frontmatter**.
- **Check:** Ticket Store shows Last write error, Last saved (path + time when applicable). Selected ticket frontmatter shows Path, kanbanColumnId, kanbanPosition, kanbanMovedAt (or "(not set)").
- **Pass:** All listed fields present and accurate.

---

## Summary
- If steps 1–5 and 7 pass, the deliverable is verified. Step 6 confirms write-failure behavior when feasible.
- If any step fails, note which step and what you saw.
