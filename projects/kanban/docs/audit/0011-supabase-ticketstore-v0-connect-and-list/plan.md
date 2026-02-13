# Plan (0011-supabase-ticketstore-v0-connect-and-list)

## Goal
Enable a hosted, multi-user-friendly source of truth by connecting the app to Supabase and listing tickets from the database (read-only).

## Deliverable (UI-only)
In the running app, a human can paste Supabase connection details into the UI, click Connect, and see a ticket list loaded from Supabase with clear in-app status and errors.

## Acceptance criteria (summary)
- Ticket Store has **Docs** and **Supabase** modes.
- Supabase mode: Config panel (Project URL, Anon key, Connect), status (Disconnected/Connecting/Connected), last error.
- Config stored in localStorage; "Saved locally" indicator; not committed to git.
- When connected: "Found N tickets" and list from Supabase; click ticket → Ticket Viewer (full content).
- If table missing: "Supabase not initialized" + Setup instructions with copy/paste SQL.
- Debug: Ticket Store (Supabase) section (Connected, Project URL present, Last refresh, Last error).

## Steps

1. **Add @supabase/supabase-js**
   - Install dependency; no auth for v0.

2. **Ticket store mode**
   - State `ticketStoreMode`: 'docs' | 'supabase'. UI: tabs "Docs" | "Supabase". Docs mode keeps existing behavior.

3. **Supabase state and localStorage**
   - State: projectUrl, anonKey, connectionStatus, lastError, tickets[], lastRefresh, notInitialized, selectedTicketId, selectedTicketContent.
   - Load projectUrl/anonKey from localStorage on mount (key: `supabase-ticketstore-config`). Save to localStorage on successful connect.

4. **Supabase Config panel (when mode === 'supabase')**
   - Project URL input, Anon key input (password type), Connect button.
   - Connection status line: Disconnected / Connecting / Connected.
   - "Saved locally" when localStorage has config.
   - Last error: value or "none".

5. **Connect flow**
   - Create Supabase client with url + anonKey. Test query: `from('tickets').select('id').limit(1)`.
   - If error indicates missing relation/table: set notInitialized true, lastError "Supabase not initialized (tickets table missing)", status disconnected.
   - Else on test success: fetch all tickets (id, filename, title, body_md, ...), set tickets and lastRefresh, status connected; persist config to localStorage.

6. **Setup SQL when not initialized**
   - Show "Supabase not initialized" and a Setup instructions region with the required `create table` SQL block (from ticket schema).

7. **Ticket list and Ticket Viewer (when connected)**
   - List: ticket title and id per row; click → set selected ticket, show body_md in viewer.
   - Ticket Viewer: same layout as Docs viewer (ID/path line + pre with content).

8. **Debug panel**
   - New section "Ticket Store (Supabase)": Connected true/false, Project URL present true/false, Last refresh time, Last error.

9. **Types and constants**
   - SupabaseTicketRow type matching table columns. SUPABASE_CONFIG_KEY, SUPABASE_SETUP_SQL constant.

10. **Audit**
    - Create docs/audit/0011-supabase-ticketstore-v0-connect-and-list/ with plan, worklog, changed-files, decisions, verification.

## Out of scope
- Auth; write-back to Supabase; syncing Supabase tickets into kanban columns; multi-project.
