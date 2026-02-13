# Verification (0001-app-shell)

All checks are done **in the browser only**. No terminal, devtools, or console.

## Prerequisites
1. In the project folder, run: `npm install` then `npm run dev`.
2. Open the URL shown (e.g. http://localhost:5173/) in a browser.

---

## Step 1: Title and subtitle
- **Check:** On first load, you see:
  - A main title: **Portfolio 2026**
  - Under it, smaller text: **Project Zero: Kanban (coming soon)**
- **Pass:** Both lines are visible and match the text above.

---

## Step 2: Debug toggle and panel visibility
- **Check:** You see a button that says **Debug OFF**.
- **Action:** Click the button once.
- **Check:** The button label changes to **Debug ON**, and a **Debug panel** appears below it (white/boxed area with sections).
- **Action:** Click the button again.
- **Check:** The button label changes back to **Debug OFF**, and the Debug panel disappears.
- **Pass:** The panel appears when you turn Debug ON and disappears when you turn it OFF.

---

## Step 3: Build info in Debug panel
- **Action:** Click the Debug button so the panel is visible (button shows **Debug ON**).
- **Check:** In the Debug panel, there is a **Build info** (or similar) section that shows the current mode.
- **Check:** In development it should show something like **Mode: dev** (or "development"). In a production build it would show **prod** or "production".
- **Pass:** You see a mode/build line (e.g. "Mode: dev") in the panel.

---

## Step 4: Action log when toggling Debug
- **Action:** With the Debug panel **closed** (button shows **Debug OFF**), click the button to open it.
- **Check:** In the Debug panel, an **Action Log** section lists at least one line, e.g. **Debug toggled ON** (possibly with a time).
- **Action:** Click the button again to close the panel, then click again to open it.
- **Check:** The Action Log now shows at least two entries (e.g. "Debug toggled ON", "Debug toggled OFF", then "Debug toggled ON" again).
- **Pass:** The Action Log updates and shows "Debug toggled ON/OFF" when you use the toggle.

---

## Step 5: Error section (empty)
- **Action:** With the Debug panel open, find the **Errors** (or similar) section.
- **Check:** It shows a message like **No errors.** or that the list is empty.
- **Pass:** The Errors section is present and indicates no errors (no need to trigger a real error).

---

## Summary
- If all five steps pass, the deliverable is verified.
- If any step fails, note which step and what you saw instead.
