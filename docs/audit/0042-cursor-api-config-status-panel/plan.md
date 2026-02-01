# Plan (0042-cursor-api-config-status-panel)

## Goal
Add a status panel in the Debug section that shows Cursor API configuration status (similar to Supabase status panel).

## Deliverable (UI-only)
In the Debug panel, there is a new section "Cursor API Config" that shows:
- Connection status (Connected/Disconnected/Not Configured)
- Configuration source (env vars, if available)
- Last check time
- Any configuration errors

## Acceptance criteria (summary)
- Debug panel includes a new section titled "Cursor API Config"
- The section shows connection status (Connected/Disconnected/Not Configured)
- The section shows which environment variables are present/missing (if applicable)
- The section shows last check/refresh time
- The section shows any configuration errors (if any)
- The status is human-verifiable without external tools

## Steps

1. **Add state management**
   - Add `cursorApiLastCheck` state to track last check time
   - Use `useState` and `useEffect` to update check time when env vars change

2. **Check environment variables**
   - Read `VITE_CURSOR_API_URL` and `VITE_CURSOR_API_KEY` from `import.meta.env`
   - Determine config status: "Not Configured" if either is missing, "Disconnected" if both present

3. **Add Debug panel section**
   - Add new section "Cursor API Config" in Debug panel
   - Display status, missing env vars (if any), API URL/Key presence, last check time
   - Follow same pattern as "Ticket Store (Supabase)" section

4. **Update .env.example**
   - Add `VITE_CURSOR_API_URL` and `VITE_CURSOR_API_KEY` to `.env.example` with placeholder values

5. **Audit artifacts**
   - Create `docs/audit/0042-cursor-api-config-status-panel/` with plan, worklog, changed-files, decisions, verification

## Out of scope
- Actual Cursor API integration/functionality
- Cursor API authentication flow
- Cursor API data fetching
- Connection logic (status display only)
