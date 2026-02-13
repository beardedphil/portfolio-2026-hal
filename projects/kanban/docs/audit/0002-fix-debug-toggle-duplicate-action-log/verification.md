# Verification (0002-fix-debug-toggle-duplicate-action-log)

All checks are done **in the browser only**. No terminal, devtools, or console.

## Prerequisites
1. In the project folder, run: `npm install` then `npm run dev`.
2. Open the URL shown (e.g. http://localhost:5173/) in a browser.

---

## Step 1: Debug panel and Total actions
- **Action:** Click the Debug button so the panel is open (button shows **Debug ON**).
- **Check:** In the Debug panel, the **Action Log** section shows a line **Total actions: N** (e.g. "Total actions: 1" after one open).
- **Pass:** "Total actions: N" is visible and N matches the number of list entries below.

---

## Step 2: One entry per click (5 clicks → 5 entries)
- **Action:** With the Debug panel **open**, click the Debug toggle **5 times** (ON → OFF → ON → OFF → ON, or any 5 clicks). Watch the Action Log list and the **Total actions** count.
- **Check:** After 5 clicks, **Total actions** shows **5** (or 5 more than before if there were already entries). The list has exactly 5 new lines (e.g. "Debug toggled ON", "Debug toggled OFF", …), with no duplicate lines for a single click.
- **Pass:** The count increases by exactly 1 per click; 5 clicks yield 5 new entries and Total actions reflects that.

---

## Step 3: Toggle behavior unchanged
- **Check:** The Debug button label still switches between **Debug ON** and **Debug OFF** when clicked.
- **Check:** The Debug panel is visible when the label is **Debug ON** and hidden when **Debug OFF**.
- **Pass:** Toggle still correctly shows/hides the panel and flips the label.

---

## Summary
- If all three steps pass, the deliverable is verified.
- If any step fails, note which step and what you saw (e.g. Total actions after 5 clicks, or number of list entries).
