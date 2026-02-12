# Plan (0014-hide-ticket-store-ui-auto-connect-supabase-project-dropdown)

## Goal
Make the app feel like "just the kanban board": auto-connect to Supabase without manual entry and show a project selector (starting with `hal-kanban`).

## Deliverable (UI-only)
On load, the app shows the kanban board and a project dropdown; it auto-connects to Supabase using env-provided config and loads tickets into the board without requiring the Ticket Store UI.

## Acceptance criteria (summary)
- Main UI shows: Project dropdown (top of page), Kanban board; optional connection status (Connected/Disconnected) near the dropdown.
- Project dropdown has exactly one option: **hal-kanban**, selected by default.
- Supabase connection is automatic: no requirement to paste Project URL / Anon key in the UI; board loads tickets from Supabase once connected.
- Old "Ticket Store" UI (manual connect form, ticket list, import UI) is not shown in the main UI; if any of it remains, it is inside the Debug panel only.
- If Supabase env config is missing/invalid at runtime: main UI shows a clear in-app error "Not connected: missing Supabase config"; Debug panel shows which env keys are missing.
- Debug panel continues to show: polling interval, last poll time, last poll error; per-column ticket IDs.

## Steps

1. **Env config**
   - Use Vite-exposed env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Update `.env.example` and add types in `vite-env.d.ts` if needed.

2. **Auto-connect from env**
   - On mount: read env; if both URL and key present, set state and connect (no manual form). Extract connect logic into a shared function `connectSupabase(url, key)`; call it from a mount effect with env values. Remove loading Supabase config from localStorage on init (env is primary).

3. **Default to Supabase board**
   - Default `ticketStoreMode` to `'supabase'` so the main board is Supabase-driven when connected.

4. **Project dropdown + connection status**
   - Add at top of main UI: Project dropdown with options `[{ id: 'hal-kanban', label: 'hal-kanban' }]`, selected by default; small connection status (Connected/Disconnected/Connecting…) near the dropdown.

5. **Hide Ticket Store from main UI**
   - Remove the entire Ticket Store section (Docs/Supabase tabs, connect form, ticket list, import UI) from the main layout. Do not add it to Debug in this ticket (optional: keep only in Debug later).

6. **Config-missing error**
   - Derive `supabaseConfigMissing` from env (missing or empty URL/key). When missing and not connected, show in main UI: "Not connected: missing Supabase config". In Debug panel (Ticket Store Supabase section): show "Missing env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY" (or which are missing).

7. **Styles**
   - Add CSS for app header bar (project dropdown, connection status) and config-missing error block.

8. **Audit**
   - Create `docs/audit/0014-hide-ticket-store-ui-auto-connect-supabase-project-dropdown/` with plan, worklog, changed-files, decisions, verification.

## Out of scope
- Multi-project support; project dropdown is UI-only for now.
- Moving Ticket Store UI into Debug panel (optional per ticket: "If any of it remains accessible, it must be inside the Debug panel only" — we removed it from main only).
