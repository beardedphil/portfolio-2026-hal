# Ticket

- **ID**: `0042`
- **Title**: Add Cursor API config status panel
- **Owner**: Implementation agent
- **Type**: Feature
- **Priority**: P0

## Goal (one sentence)

Add a status panel in the Debug section that shows Cursor API configuration status (similar to Supabase status panel).

## Human-verifiable deliverable (UI-only)

In the Debug panel, there is a new section "Cursor API Config" that shows:
- Connection status (Connected/Disconnected/Not Configured)
- Configuration source (env vars, if available)
- Last check time
- Any configuration errors

## Acceptance criteria (UI-only)

- [ ] Debug panel includes a new section titled "Cursor API Config"
- [ ] The section shows connection status (Connected/Disconnected/Not Configured)
- [ ] The section shows which environment variables are present/missing (if applicable)
- [ ] The section shows last check/refresh time
- [ ] The section shows any configuration errors (if any)
- [ ] The status is human-verifiable without external tools

## Constraints

- Keep this task as small as possible while still producing a **human-verifiable** UI change.
- Verification must require **no external tools** (no terminal, no devtools, no console).
- Follow the same pattern as the existing Supabase status panel in the Debug section.

## Non-goals

- Actual Cursor API integration/functionality
- Cursor API authentication flow
- Cursor API data fetching

## Implementation notes (optional)

- Follow the pattern of the existing "Ticket Store (Supabase)" section in the Debug panel
- Check for Cursor API configuration via environment variables (e.g., `VITE_CURSOR_API_URL`, `VITE_CURSOR_API_KEY`)
- Status should be "Not Configured" if env vars are missing, "Disconnected" if configured but not connected, "Connected" if connected
- For now, this is a status display only - no actual API calls needed

## QA / Testing

**Branch:** `cursor/cursor-api-config-status-panel-5409`

**Repository:** `portfolio-2026-basic-kanban`

**How to test:**
1. Checkout the branch: `git checkout cursor/cursor-api-config-status-panel-5409`
2. Run `npm install` (if needed)
3. Run `npm run dev`
4. Open the app in browser
5. Click **Debug** to open Debug panel
6. Look for **"Cursor API Config"** section
7. Follow verification steps in `docs/audit/0042-cursor-api-config-status-panel/verification.md`

**Pull Request:** https://github.com/beardedphil/portfolio-2026-basic-kanban/pull/new/cursor/cursor-api-config-status-panel-5409

## Audit artifacts required (implementation agent)

Create `docs/audit/0042-cursor-api-config-status-panel/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)
