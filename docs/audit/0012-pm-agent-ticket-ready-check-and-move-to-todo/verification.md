# Verification (UI-only): 0012 - PM agent: ticket ready check + move to To Do

## Prerequisites

- Project folder connected (with .env containing VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for a Supabase project that has `tickets` and `kanban_columns` tables).
- HAL app running (e.g. npm run dev from repo root); Kanban board running (e.g. port 5174).
- hal-agents built (`npm run build` in projects/hal-agents).
- At least one ticket in **Unassigned** on the Kanban board (e.g. create one via PM "create a ticket" or ensure an existing ticket is in Unassigned).

## Steps

### A. Move a ready ticket to To Do

1. Pick a ticket that is **ready to start** (has Goal, Human-verifiable deliverable, Acceptance criteria checkboxes, Constraints, Non-goals, and no obvious placeholders like `<AC 1>`). If needed, use one that already exists in docs/tickets and is in Unassigned (e.g. after sync).
2. Open HAL; connect the project folder; select Project Manager chat.
3. Ask the PM to move that ticket to To Do (e.g. "Move ticket 0012 to To Do" or "Move this ticket to To Do" after referring to the ticket).
4. **Confirm** the PM reply says the ticket passed the readiness check and was moved to To Do (or a short confirmation that it was moved).
5. Open **Diagnostics**; expand **Tool Calls**. Confirm:
   - `fetch_ticket_content` was called (input: ticket_id; output: success, body_md or error).
   - `evaluate_ticket_ready` was called (output: ready: true, missingItems: [], checklistResults).
   - `kanban_move_ticket_to_todo` was called (output: success: true, ticketId, fromColumn: col-unassigned, toColumn: col-todo).
6. On the **Kanban board**, confirm the ticket has left Unassigned and appears under **To Do** (refresh or wait for poll if needed).

### B. Refuse when not ready

1. Use a ticket that is **not** ready (e.g. missing Goal, or has placeholder `<AC 1>` in acceptance criteria, or empty Non-goals).
2. In PM chat, ask to move that ticket to To Do (e.g. "Move ticket NNNN to To Do").
3. **Confirm** the PM does **not** move the ticket and instead replies with a clear list of what is missing (e.g. "Missing: Goal (one sentence) missing or placeholder", "Unresolved placeholders: <AC 1>").
4. In **Diagnostics** → Tool Calls, confirm:
   - `fetch_ticket_content` was called.
   - `evaluate_ticket_ready` was called with output ready: false and non-empty missingItems.
   - `kanban_move_ticket_to_todo` was **not** called.
5. On the Kanban board, the ticket remains in **Unassigned**.

### C. Checklist and tools visible in repo

6. In the repo, confirm **docs/process/ready-to-start-checklist.md** exists and lists the five checklist items (Goal, Human-verifiable deliverable, Acceptance criteria checkboxes, Constraints + Non-goals, no placeholders).

## Pass criteria

- A human can ask the PM to move a ticket to To Do; the PM either refuses with a clear missing-items list or confirms and moves it.
- The move is visible on the Kanban board (ticket leaves Unassigned, appears under To Do).
- Diagnostics shows the readiness decision (pass/fail + reasons), the kanban mutation (ticket id, from column, to column), and the tool calls used to fetch ticket content—without using terminal or devtools.
- The Ready-to-start checklist is documented in docs/process and is used by the PM (visible in context / tool behavior).
