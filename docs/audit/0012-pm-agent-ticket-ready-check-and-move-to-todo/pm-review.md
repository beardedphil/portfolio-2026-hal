# PM review: 0012 - PM agent: ticket ready check + move to To Do

## Summary

- Documented Ready-to-start checklist in docs/process/ready-to-start-checklist.md; PM context pack includes it.
- PM agent can fetch any ticket by id (Supabase or repo), evaluate readiness via evaluate_ticket_ready, and move a ticket from Unassigned to To Do via kanban_move_ticket_to_todo only when ready.
- Diagnostics show readiness decision (pass/fail + missing items), kanban mutation (ticket id, from/to column), and fetch/evaluate tool calls.

## Likelihood of success

**Score (0–100%)**: 85%

**Why (bullets):**

- Flow is deterministic: fetch → evaluate → move or refuse; tools are implemented and wired.
- Readiness is code-based (evaluateTicketReady) so pass/fail is consistent and visible in tool output.
- Move is gated: kanban_move_ticket_to_todo only updates when ticket is in Unassigned.

## What to verify (UI-only)

- Move a **ready** ticket to To Do via chat; confirm PM says it moved and Kanban shows the ticket under To Do; Diagnostics shows fetch_ticket_content, evaluate_ticket_ready (ready: true), kanban_move_ticket_to_todo (success).
- Ask to move a **not-ready** ticket; confirm PM refuses with missing items and does **not** call kanban_move_ticket_to_todo; ticket stays in Unassigned.
- Confirm docs/process/ready-to-start-checklist.md exists and matches the five criteria.

## Potential failures (ranked)

1. **PM skips evaluate_ticket_ready and moves anyway** — Ticket moves to To Do even when placeholders remain. Confirm in Diagnostics that evaluate_ticket_ready is called before kanban_move_ticket_to_todo and that when not ready, kanban_move_ticket_to_todo is not in the tool list for that turn.
2. **fetch_ticket_content fails for repo-only ticket** — User has ticket only in docs/tickets (not in Supabase). PM says ticket not found. Confirm Supabase has the ticket row (sync) or that repo fallback runs (list docs/tickets, read NNNN-*.md); check tool output in Diagnostics.
3. **Column id mismatch** — Kanban uses different column ids. Ticket moves but doesn’t appear in To Do. Confirm Supabase kanban_columns has col-todo and Kanban UI maps it to "To Do".

## Audit completeness check

- **Artifacts present**: plan, worklog, changed-files, decisions, verification, pm-review
- **Traceability**: Verification steps map to acceptance criteria (ready move, refuse when not ready, diagnostics, checklist in repo).

## Follow-ups (optional)

- Optional: expose "Move to To Do" as a button next to a ticket in Kanban that sends a predefined PM message (same flow).
- Optional: stricter placeholder regex (e.g. allow intentional angle brackets in prose).
