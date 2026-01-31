# Verification (UI-only): 0030 - Ticket list: add Delete button and sync deletion to filesystem

## Prerequisites

- Project folder connected (with .env containing VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY).
- HAL app running (e.g. npm run dev from repo root); Kanban app running (port 5174).
- At least one ticket in docs/tickets/ and in Supabase (e.g. docs/tickets/0001-some-ticket.md).

## Steps

1. Open HAL; connect the project folder.
2. Confirm the Kanban board shows tickets in columns.
3. Locate a ticket card; confirm a **Delete** button is visible on each card.
4. Click Delete; confirm a confirmation dialog appears (e.g. "Delete ticket ...? This cannot be undone.").
5. Click Cancel; confirm the ticket remains.
6. Click Delete again; confirm; click OK.
7. Confirm the ticket disappears from the UI (within poll interval or after refresh).
8. Confirm the corresponding markdown file under docs/tickets/ is removed (open project in file explorer or editor; file should be gone).
9. If deletion or sync fails: confirm an error appears in the Debug panel (Last delete error) and in an in-app banner (Delete failed: ...).

## Pass criteria

- Each ticket card has a visible Delete button when Supabase is connected.
- Clicking Delete prompts for confirmation.
- After confirming, the ticket is deleted in Supabase and no longer appears in the UI.
- The local docs/tickets/<id>-<slug>.md file is removed after sync.
- Errors are shown in the Debug panel and in-app without using terminal or devtools.
