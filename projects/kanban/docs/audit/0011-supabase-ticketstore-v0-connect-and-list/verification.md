# Verification (0011-supabase-ticketstore-v0-connect-and-list)

All checks are done **in the browser only**. No terminal, devtools, or console.

## Prerequisites
1. In the project folder: `npm install` then `npm run dev`.
2. Open the app in a browser.
3. (For Supabase connected flow) A Supabase project with the `tickets` table created (run the Setup SQL from the ticket/plan if needed).
4. (For "not initialized" flow) A Supabase project where the `tickets` table has **not** been created.

---

## Step 1: Ticket Store mode selector
- **Action:** Find the **Ticket Store** section. Look for two tabs/buttons: **Docs** and **Supabase**.
- **Check:** **Docs** is selected by default. The existing "Connect project" / tickets list (when connected) behavior is unchanged when Docs is selected.
- **Pass:** Mode selector visible; Docs mode works as before.

---

## Step 2: Supabase mode — Config panel
- **Action:** Click **Supabase**. Inspect the Supabase Config area.
- **Check:** You see: **Supabase Config** heading; connection status (Disconnected / Connecting / Connected); **Project URL** input; **Anon key** input; **Connect** button; **Last error:** line (value or "none"). If you had previously connected successfully in this browser, "Saved locally" may appear.
- **Pass:** All listed elements present.

---

## Step 3: Connect with valid Supabase (table exists)
- **Action:** Paste a valid Supabase Project URL and Anon key. Click **Connect**.
- **Check:** Status briefly shows **Connecting**, then **Connected**. You see **Found N tickets.** and a list of ticket titles/IDs from the database. No "Supabase not initialized" message. Last error shows "none" (or previous error cleared).
- **Pass:** Connected; ticket count and list from Supabase; no schema error.

---

## Step 4: Ticket Viewer (Supabase)
- **Action:** Click one ticket in the Supabase ticket list.
- **Check:** The Ticket Viewer shows the ticket **ID** and the full ticket content (e.g. markdown from `body_md`). Placeholder text "Click a ticket to view its contents." is gone.
- **Pass:** Selected ticket content visible in viewer.

---

## Step 5: Supabase not initialized
- **Action:** Use a Supabase project where the `tickets` table does **not** exist (or use an invalid URL/key that still reaches Supabase but table is missing). Paste URL and key, click **Connect**.
- **Check:** An in-app message like **Supabase not initialized** (or similar). A **Setup instructions** area is visible with a copy/paste **SQL block** that creates the `tickets` table (matching the ticket schema). Connection status remains Disconnected (or reverts to it).
- **Pass:** Clear "not initialized" message and setup SQL block visible.

---

## Step 6: Debug — Ticket Store (Supabase)
- **Action:** Open **Debug** (click Debug toggle). Find the section **Ticket Store (Supabase)**.
- **Check:** It shows: **Connected** true/false; **Project URL present** true/false; **Last refresh time** (ISO string or "never"); **Last error** (value or "none").
- **Pass:** All four lines present and accurate for current state.

---

## Step 7: Saved locally
- **Action:** After a successful Connect (Step 3), refresh the page. Switch to Supabase mode.
- **Check:** Project URL and Anon key inputs are pre-filled (from localStorage). "Saved locally" indicator is visible. You can click Connect again to reload tickets without re-pasting.
- **Pass:** Config restored from localStorage; "Saved locally" shown.

---

## Summary
- If steps 1–4, 6 and 7 pass (and step 5 when testing against a project without the table), the deliverable is verified.
- If any step fails, note which step and what you saw.
