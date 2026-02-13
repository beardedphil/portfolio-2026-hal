# Verification (0012-supabase-import-tickets-from-docs)

All checks are done **in the browser only**. No terminal, devtools, or console.

## Prerequisites
1. In the project folder: `npm install` then `npm run dev`.
2. Open the app in a browser.
3. A Supabase project with the `tickets` table created (run Setup SQL from 0011 if needed).
4. A project folder that contains `docs/tickets/*.md` (e.g. this repo).

---

## Step 1: Import from Docs section in Supabase mode
- **Action:** Open Ticket Store, click **Supabase**. Find the **Import from Docs** section.
- **Check:** The section exists with heading "Import from Docs". If Supabase is not connected, you see: "Connect Supabase first (Project URL + Anon key, then Connect)."
- **Pass:** Section visible; message shown when Supabase not connected.

---

## Step 2: Docs folder required
- **Action:** Connect Supabase (Project URL + Anon key, Connect). Do **not** connect the project folder (stay on Supabase tab; if you had connected folder in Docs tab earlier, that still counts as "connected").
- **Check:** If project folder is not connected, the Import section shows: "Connect project folder first (switch to Docs tab and use Connect project folder)."
- **Pass:** Clear message when Docs folder is not connected.

---

## Step 3: Preview import (both connected)
- **Action:** Connect project folder: switch to **Docs**, click Connect project folder and select the repo root. Switch back to **Supabase**. Click **Preview import**.
- **Check:** You see totals: **Found N**, **Will create X**, **Will update Y**, **Will skip Z**, and optionally **Will fail W**. A scrollable list shows each filename with its planned action (create/update/skip/fail) and reason for skip/fail.
- **Pass:** Totals and list match the files in `docs/tickets/*.md` and current Supabase state.

---

## Step 4: Run Import
- **Action:** Click **Import**.
- **Check:** Progress text appears (e.g. "Importing 1/N…"). When done, a summary appears (e.g. "Created X, updated Y, skipped Z."). The Supabase ticket list below updates and shows the imported tickets; the count matches the import summary.
- **Pass:** Import completes; list and count updated; summary visible.

---

## Step 5: Idempotent re-run (no duplication)
- **Action:** Without changing any file, click **Preview import** again, then **Import** again (or just **Import** again).
- **Check:** Preview shows **Will create 0**, **Will update 0**, and **Will skip** non-zero (or equivalent "unchanged"). After Import, summary shows 0 creates, 0 updates, non-zero skips. Ticket count does not increase (no duplicate rows).
- **Pass:** Re-run results in no creates, no updates, only skips; count unchanged.

---

## Step 6: Import error and Debug
- **Action:** (Optional) If you can trigger a write failure (e.g. revoke table permissions, or use a key that cannot insert), run Import. Otherwise skip.
- **Check:** The UI shows a clear in-app error (e.g. "Import error: ..."). Open **Debug** → **Ticket Store (Supabase)**. The line **Last import error** shows the same error (or "none" if no error).
- **Pass:** In-app error and Debug "Last import error" both reflect the failure.

---

## Step 7: Table missing
- **Action:** Use a Supabase project where the `tickets` table does not exist. Connect Supabase (so status is Disconnected and "Supabase not initialized" + Setup SQL are shown). The Import section still shows "Connect Supabase first" because status is not connected.
- **Check:** After creating the table (run Setup SQL in Supabase), connect again. Then Import from Docs works as in Steps 3–5.
- **Pass:** When table is missing, setup instructions are shown; after creating table, import works.

---

## Summary
- If steps 1–5 pass (and 6–7 when applicable), the deliverable is verified.
- If any step fails, note which step and what you saw.
