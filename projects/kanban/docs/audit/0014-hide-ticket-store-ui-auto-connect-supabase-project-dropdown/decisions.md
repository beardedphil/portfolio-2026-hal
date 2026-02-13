# Decisions (0014-hide-ticket-store-ui-auto-connect-supabase-project-dropdown)

## Env as single source for Supabase on load
- **Decision:** Supabase connection on load uses only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Removed loading from localStorage on init; auto-connect effect runs once with env values.
- **Rationale:** Ticket: "auto-connect to Supabase without manual entry" and "no requirement to paste Project URL / Anon key into the UI." Env keeps config out of the UI and supports one canonical config per environment.

## Project dropdown UI-only
- **Decision:** Project dropdown has a single option `hal-kanban`; state `selectedProjectId` is used for display only. No project_id filtering or schema change in this ticket.
- **Rationale:** Ticket: "The project dropdown can be a simple local constant for now" and "If the DB schema doesn't include project scoping yet, the dropdown is UI-only for now."

## Ticket Store removed from main UI only
- **Decision:** The entire Ticket Store section (Docs/Supabase tabs, connect form, ticket list, import/sync) was removed from the main layout. Related state and handlers were left in App.tsx (not moved into Debug) to keep the change small.
- **Rationale:** Ticket: "The old Ticket Store UI ... is not shown in the main UI." Optional: "If any of it remains accessible, it must be inside the Debug panel only" — we did not re-add it to Debug in this ticket.

## Config-missing: main message + Debug detail
- **Decision:** When env is missing or invalid, main UI shows a single non-technical message: "Not connected: missing Supabase config." Debug panel shows which env keys are missing (e.g. "Missing env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY").
- **Rationale:** Ticket: "the board shows a clear in-app error state (non-technical)" and "the Debug panel shows the underlying detail (which env keys are missing)."

## Default mode Supabase
- **Decision:** `ticketStoreMode` defaults to `'supabase'` so the main board is Supabase-driven when connected, without a visible mode selector.
- **Rationale:** Ticket: app should feel like "just the kanban board" and auto-connect; no Ticket Store UI, so no mode choice in main UI.
