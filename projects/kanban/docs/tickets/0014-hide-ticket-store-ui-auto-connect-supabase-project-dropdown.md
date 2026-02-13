## Ticket

- **ID**: `0014`
- **Title**: Simplify UI — auto-connect Supabase from env, hide Ticket Store UI, add project dropdown
- **Owner**: Implementation agent
- **Type**: Feature
- **Priority**: P0

## Goal (one sentence)

Make the app feel like “just the kanban board”: auto-connect to Supabase without manual entry and show a project selector (starting with `hal-kanban`).

## Human-verifiable deliverable (UI-only)

On load, the app shows the kanban board and a project dropdown; it auto-connects to Supabase using env-provided config and loads tickets into the board without requiring the Ticket Store UI.

## Acceptance criteria (UI-only)

- [ ] The main UI shows:
  - a **Project** dropdown (top of page is fine)
  - the **Kanban board**
  - (optional) a small connection status indicator (Connected/Disconnected) near the dropdown
- [ ] The Project dropdown has exactly one option: **`hal-kanban`**, selected by default.
- [ ] Supabase connection is **automatic**:
  - there is no requirement to paste Project URL / Anon key into the UI
  - the board loads tickets from Supabase once connected
- [ ] The old “Ticket Store” UI (manual connect form, ticket list, import UI) is **not shown in the main UI**.
  - If any of it remains accessible, it must be inside the Debug panel only.
- [ ] If Supabase env config is missing/invalid at runtime:
  - the board shows a clear in-app error state (non-technical) like **“Not connected: missing Supabase config”**
  - the Debug panel shows the underlying detail (which env keys are missing)
- [ ] Debug panel continues to show:
  - polling interval + last poll time + last poll error
  - per-column ticket IDs (so a human can verify DB-loaded state without external tools)

## Constraints

- Keep this task as small as possible while still producing a **human-verifiable** UI change.
- Verification must require **no external tools** (no terminal, no devtools, no console).
- No multi-project support yet beyond the dropdown stub (single project option only).

## Non-goals

- No “create new project” flow yet.
- No project attach wizard yet.
- No auth yet.

## Implementation notes (optional)

- Use Vite-exposed env vars for frontend config, e.g.:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- Keep `.env` local-only; keep `.env.example` up to date.
- The project dropdown can be a simple local constant for now:
  - `[ { id: 'hal-kanban', label: 'hal-kanban' } ]`
- If the DB schema doesn’t include project scoping yet, the dropdown is UI-only for now (future tickets will add project_id to schema + filtering).

## Audit artifacts required (implementation agent)

Create `docs/audit/0014-hide-ticket-store-ui-auto-connect-supabase-project-dropdown/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)
