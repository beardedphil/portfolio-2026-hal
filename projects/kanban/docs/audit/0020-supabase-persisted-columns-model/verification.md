# Verification (0020-supabase-persisted-columns-model)

All checks are done **in the browser only**. No terminal, devtools, or console (except starting the dev server).

## Prerequisites
1. Supabase project with `tickets` table. Create `kanban_columns` table if needed:
   ```sql
   create table if not exists public.kanban_columns (
     id text primary key,
     title text not null,
     position int not null,
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now()
   );
   ```
2. Project folder with `.env` containing `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. `npm run dev` and open the app. Connect project folder (Connect Project Folder → pick folder with .env).

---

## Step 1: Columns loaded from Supabase
- **Action:** Connect to Supabase (Connect Project Folder). Ensure connection status is “Connected”.
- **Check:** Board shows columns. If `kanban_columns` was empty, default columns (Unassigned, To-do, Doing, Done) appear.
- **Pass:** Columns are loaded from Supabase (not hardcoded demo).

---

## Step 2: Add column visible in Supabase mode
- **Action:** With Supabase connected, look at the Columns section.
- **Check:** The **Add column** button is visible next to the column cards.
- **Pass:** Add column is visible in Supabase mode.

---

## Step 3: Create column and persist
- **Action:** Click **Add column**. Enter a name (e.g. “Backlog”). Click **Create**.
- **Check:** New column appears immediately. Refresh the page. The new column is still there.
- **Pass:** Column creation persists to Supabase and survives refresh.

---

## Step 4: Move ticket into custom column
- **Action:** Drag a ticket from the list (or from another column) into the new column. Wait for polling (~10s) or refresh.
- **Check:** Ticket remains in the new column after refresh.
- **Pass:** Tickets can be moved into custom columns with persistence.

---

## Step 5: Default columns when empty
- **Action:** (Optional) Use a fresh Supabase project with empty `kanban_columns`. Connect. Open Debug → Action Log.
- **Check:** Action log shows “Initialized default columns”. Board shows Unassigned, To-do, Doing, Done.
- **Pass:** Default columns are seeded and logged.

---

## Step 6: In-app diagnostics
- **Action:** Open Debug panel. Scroll to **Ticket Store (Supabase)**.
- **Check:** When Supabase connected, section shows: Columns source: Supabase, Column count, Last columns refresh, Last columns error. If any tickets have unknown column IDs, “Tickets with unknown column (moved to first)” appears.
- **Pass:** All column diagnostics visible in Debug.

---

## Summary
- If steps 1–6 pass, the deliverable is verified.
- If any step fails, note which step and what you saw.
