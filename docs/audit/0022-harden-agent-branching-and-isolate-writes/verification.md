# Verification (UI-only): 0022 - Harden agent branching and isolate repo writes

## Prerequisites

- Project folder connected (with .env containing VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY).
- HAL app and Kanban app running (e.g. npm run dev from repo root).
- hal-agents built. Repo is a git repository with remote (for push).
- User's working tree can be on main or another branch; optional: have uncommitted changes in another file to confirm they are not touched.

## Steps

1. Open HAL; connect the project folder.
2. Select Project Manager chat; send a message that triggers ticket creation (e.g. "Create a ticket for adding a dark mode toggle").
3. Confirm the PM reply states the ticket was created and mentions the **branch** (e.g. `ticket/NNNN-title-slug`).
4. Open **Diagnostics** and expand the Ticket creation section. Confirm:
   - **Branch (isolated write)** shows the feature branch name (e.g. `ticket/0022-harden-agent-branching-and-isolate-writes`).
   - **Paths staged/committed** shows only the ticket file path (e.g. `docs/tickets/NNNN-title-slug.md`).
   - **Sync:** Success.
5. In the repo (e.g. in terminal or file explorer): confirm the **current branch and working tree are unchanged** (still main or whatever branch you were on; no new file in docs/tickets/ in the main checkout if you were on main). The new ticket file exists only on the pushed feature branch.
6. Optional: With uncommitted changes in another file (e.g. a note in README), trigger ticket creation again; confirm those unrelated files are not staged or modified by the action.
7. If runner fails (e.g. git not available, or push fails due to permissions): confirm Diagnostics shows **Sync: Failed** and an error message (repo write error); no partial write to main.

## Pass criteria

- When the user triggers ticket creation, HAL does not modify the user's current main working tree.
- Repo write is performed in an isolated workspace (feature branch in a worktree); Diagnostics shows the branch name and the exact paths staged/committed.
- Only the ticket file is staged/committed; no `git add .` or unrelated files.
- Commit subject includes the ticket ID; feature branch is pushed.
- If branch creation or push fails, the error is shown in-app (Diagnostics); no silent partial writes.
