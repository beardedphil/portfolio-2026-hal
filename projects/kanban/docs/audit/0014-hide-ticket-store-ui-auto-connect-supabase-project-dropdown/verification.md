# Verification (0014-hide-ticket-store-ui-auto-connect-supabase-project-dropdown)

All checks are done **in the browser only**. No terminal, devtools, or console.

## Prerequisites
1. In the project folder: `npm install` then `npm run dev`.
2. Open the app in a browser.
3. For "connected" checks: copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to a valid Supabase project with the `tickets` table (e.g. from 0011/0012). Restart dev server after changing `.env`.

---

## Step 1: Main UI – project dropdown and connection status
- **Action:** Load the app (with valid env if you want Connected state).
- **Check:** Below the title you see a **Project** dropdown and a connection status (Connected / Disconnected / Connecting…). The dropdown has one option: **hal-kanban**, and it is selected.
- **Pass:** Project dropdown and connection status are visible; hal-kanban is the only option and selected.

---

## Step 2: No Ticket Store in main UI
- **Action:** Look at the main page (no Debug open).
- **Check:** There is no "Ticket Store" section, no Docs/Supabase tabs, no Project URL or Anon key inputs, no ticket list, no "Connect project" or "Connect" button in the main content.
- **Pass:** Ticket Store UI is not shown in the main UI.

---

## Step 3: Auto-connect when env is set
- **Action:** Ensure `.env` has valid `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; restart dev server; reload the app.
- **Check:** Without pasting anything in the UI, the connection status becomes **Connected** (possibly after "Connecting…"). The Columns section shows the kanban board (To-do, Doing, Done) with tickets loaded from Supabase (if any exist).
- **Pass:** App auto-connects and board shows Supabase tickets; no manual URL/key entry.

---

## Step 4: Config missing – main UI error
- **Action:** Remove or empty `VITE_SUPABASE_URL` and/or `VITE_SUPABASE_ANON_KEY` in `.env` (or run without `.env`); restart dev server; reload the app.
- **Check:** The main UI shows a clear message such as **"Not connected: missing Supabase config"** (e.g. in a highlighted block). Connection status remains Disconnected.
- **Pass:** Non-technical error message is visible when env config is missing.

---

## Step 5: Config missing – Debug panel detail
- **Action:** With env still missing, open **Debug** (click Debug toggle). Find the **Ticket Store (Supabase)** section.
- **Check:** You see which env keys are missing, e.g. **"Missing env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY"** (or one of them if only one is missing).
- **Pass:** Debug panel shows which env keys are missing.

---

## Step 6: Debug panel – polling and per-column IDs
- **Action:** With valid env and Connected state, open **Debug**. Check **Ticket Store (Supabase)**.
- **Check:** You see: **Polling: 10s** (or off when not connected), **Last poll time**, **Last poll error**, **Per-column ticket IDs** (e.g. "To-do: 0001,0002 | Doing: (empty) | Done: (empty)").
- **Pass:** Polling interval, last poll time, last poll error, and per-column ticket IDs are visible in Debug.

---

## Summary
- If steps 1–6 pass, the deliverable is verified.
- If any step fails, note which step and what you saw.
