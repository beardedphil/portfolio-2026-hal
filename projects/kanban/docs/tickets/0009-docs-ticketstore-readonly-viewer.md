## Ticket

- **ID**: `0009`
- **Title**: Ticket Store v0 — connect to project folder and view `docs/tickets/*.md` (read-only)
- **Owner**: Implementation agent
- **Type**: Feature
- **Priority**: P0

## Goal (one sentence)

Make tickets visible in-app by connecting to a project folder and reading `docs/tickets/*.md`, without editing yet.

## Human-verifiable deliverable (UI-only)

In the running app, a human can click **Connect project**, select a folder, and then browse a list of ticket files found under `docs/tickets/` and view their contents with clear in-app status/errors.

## Acceptance criteria (UI-only)

- [ ] The UI includes a new **Tickets (Docs)** panel/section with a visible connection status (e.g. **Disconnected** / **Connected**).
- [ ] When **Disconnected**, the panel shows a **Connect project** button and a short explanation that it reads `docs/tickets/*.md` from a selected folder.
- [ ] Clicking **Connect project** opens a folder picker. Selecting the current repo folder results in **Connected** status.
- [ ] After connecting, the app shows:
  - a **Ticket file count** (e.g. “Found N tickets”), and
  - a scrollable **list of ticket filenames** (e.g. `0008-fix-...md`).
- [ ] Clicking a filename shows a **Ticket Viewer** area that displays:
  - the **relative path** (e.g. `docs/tickets/0008-fix-...md`), and
  - the **full file contents** (plain text is fine; markdown rendering optional).
- [ ] If the user cancels the folder picker, the UI remains **Disconnected** and shows an in-app message like **“Connect cancelled.”** (no console required).
- [ ] If the selected folder does not contain `docs/tickets/`, the UI remains Connected-but-empty and shows a clear in-app message like **“No `docs/tickets` folder found.”** plus “Found 0 tickets.”
- [ ] The Debug panel includes a **Ticket Store** section showing:
  - `Store: Docs (read-only)`
  - `Connected: true/false`
  - `Last refresh: <timestamp or “never”>`
  - `Last error: <message or “none”>`

## Constraints

- Keep this task as small as possible while still producing a **human-verifiable** UI change.
- Verification must require **no external tools** (no terminal, no devtools, no console).
- Do **not** silently fall back to demo data; show a clear in-app disconnected/error state instead.

## Non-goals

- No create/edit/delete tickets yet.
- No syncing tickets into the kanban board yet.
- No git operations from the UI yet.

## Implementation notes (optional)

- Preferred approach: **File System Access API** (`window.showDirectoryPicker`) so it works without a backend.
- Treat the selected folder as “project root”; read `docs/tickets/` relative to it.
- Keep file reads simple: `*.md` only, UTF-8 text.
- Add a manual **Refresh** button if needed for easy verification (optional; only if it materially improves UX).

## Audit artifacts required (implementation agent)

Create `docs/audit/0009-docs-ticketstore-readonly-viewer/` containing:
- `plan.md`
- `worklog.md` (must include commit hash(es) + `git status -sb` output when ready)
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)
