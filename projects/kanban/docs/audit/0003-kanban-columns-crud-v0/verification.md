# Verification (0003-kanban-columns-crud-v0)

All checks are done **in the browser only**. No terminal, devtools, or console.

## Prerequisites
1. In the project folder, run: `npm install` then `npm run dev`.
2. Open the URL shown (e.g. http://localhost:5173/) in a browser.

---

## Step 1: Columns section and Add column button
- **Check:** The page shows a **Columns** section with an **Add column** button.
- **Pass:** You see the heading "Columns" and a button labeled "Add column".

---

## Step 2: Add column form (Create/Cancel)
- **Action:** Click **Add column**.
- **Check:** A small form appears with at least: a text input (e.g. "Column name" placeholder) and **Create** and **Cancel** buttons.
- **Pass:** The form is visible and you can type in the input and see Create/Cancel.

---

## Step 3: Creating a column
- **Action:** Type a name (e.g. "To Do") in the input and click **Create**.
- **Check:** A column card appears immediately with that name. The form disappears (or is no longer shown).
- **Pass:** You see a new column card with the entered name; the form is gone.

---

## Step 4: Remove column
- **Check:** Each column card has a **Remove** button.
- **Action:** Click **Remove** on one of the columns.
- **Check:** That column disappears from the UI immediately.
- **Pass:** The column is no longer visible after clicking Remove.

---

## Step 5: Debug panel — Kanban state
- **Action:** Open the Debug panel (click **Debug** so it shows **Debug ON**).
- **Check:** The Debug panel has a **Kanban state** section that shows:
  - **Column count: N** (a number).
  - **Column names:** either a list of names separated by commas, or "(none)" if there are no columns.
- **Pass:** You can read the column count and the list of column names without using any external tools. After adding/removing columns, the count and names update to match what you see on the page.

---

## Summary
- If all five steps pass, the deliverable is verified.
- If any step fails, note which step and what you saw (e.g. "Step 3: form did not close after Create" or "Step 5: Kanban state section missing").
