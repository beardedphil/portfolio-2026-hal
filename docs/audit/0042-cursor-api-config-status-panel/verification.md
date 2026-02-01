# Verification (0042-cursor-api-config-status-panel)

All checks are done **in the browser only**. No terminal, devtools, or console.

## Prerequisites
1. In the project folder, run: `npm install` then `npm run dev`.
2. Open the URL shown (e.g. http://localhost:5173/) in a browser.
3. Open the Debug panel (click **Debug** so it shows **Debug ON**).

---

## Step 1: Verify "Cursor API Config" section exists
- **Action:** Scroll through the Debug panel sections.
- **Check:** There is a section titled **"Cursor API Config"** (appears after "Ticket Store (Supabase)" section and before "Action Log" section).
- **Pass:** Section is visible with correct title.

---

## Step 2: Verify status when env vars are missing
- **Action:** Check the "Cursor API Config" section (assuming `.env` doesn't have Cursor API vars set).
- **Check:** 
  - Status shows **"Not Configured"**
  - There is a message showing missing env vars: **"Missing env: VITE_CURSOR_API_URL, VITE_CURSOR_API_KEY"** (or shows which ones are missing)
  - "API URL present" shows **"false"**
  - "API Key present" shows **"false"**
  - "Last check" shows a timestamp (ISO format) or "never"
- **Pass:** All status fields show correct values for missing configuration.

---

## Step 3: Verify status when env vars are present (optional)
- **Action:** Add `VITE_CURSOR_API_URL` and `VITE_CURSOR_API_KEY` to `.env` file, restart dev server, refresh browser.
- **Check:**
  - Status shows **"Disconnected"** (not "Not Configured")
  - No "Missing env" message appears
  - "API URL present" shows **"true"**
  - "API Key present" shows **"true"**
  - "Last check" shows a recent timestamp
- **Pass:** Status correctly reflects configured but not connected state.

---

## Step 4: Verify last check time updates
- **Action:** After adding/removing env vars and refreshing, check the "Last check" time.
- **Check:** The "Last check" timestamp updates to reflect when the configuration was last evaluated (should be recent after refresh).
- **Pass:** Last check time updates appropriately.

---

## Step 5: Verify section styling consistency
- **Action:** Compare the "Cursor API Config" section with the "Ticket Store (Supabase)" section.
- **Check:** Both sections use the same styling (same heading style, same `build-info` class, same text formatting).
- **Pass:** Visual consistency with existing status panel.

---

## Summary
- If all steps pass, the deliverable is verified.
- If any step fails, note which step and what you saw (e.g. "Step 1: section not found" or "Step 2: status shows incorrect value").
