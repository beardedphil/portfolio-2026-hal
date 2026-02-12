# Verification (0006-fix-add-column-button-styling)

All checks are done **in the browser only**. No terminal, devtools, or console.

## Prerequisites
1. In the project folder, run: `npm install` then `npm run dev`.
2. Open the URL shown (e.g. http://localhost:5173/) in a browser.

---

## Step 1: Add column button — single button on load
- **Action:** Look at the **Add column** button (below the "Columns" heading).
- **Check:** The button appears as **one** button with consistent dark styling (no bright orange background or border appearing "inside" the black button).
- **Pass:** Single, clean button appearance.

---

## Step 2: Add column button — hover
- **Action:** Hover over the **Add column** button.
- **Check:** The button still looks like one button (no double borders or nested orange).
- **Pass:** Hover is consistent.

---

## Step 3: Add column button — click opens form
- **Action:** Click **Add column**.
- **Check:** The add-column form appears (Column name input, Create, Cancel). No new styling glitches.
- **Pass:** Click behavior unchanged; form opens.

---

## Step 4: Other buttons unchanged
- **Action:** Look at **Debug** (Debug OFF/ON), and if the add-column form is open, at **Create** and **Cancel**. If columns exist, look at **Remove** on a column.
- **Check:** These buttons look and behave as before (no regressions).
- **Pass:** No other button styles regressed.

---

## Summary
- If all four steps pass, the deliverable is verified.
- If any step fails, note which step and what you saw (e.g. "Step 1: orange box visible inside Add column button").
