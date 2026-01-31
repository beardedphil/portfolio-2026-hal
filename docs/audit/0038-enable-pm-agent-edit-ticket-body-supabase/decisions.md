# Decisions: 0038 - Enable PM/agent to edit ticket body in Supabase

## Tool vs script

- **update_ticket_body** tool: For PM agent to fix tickets when user asks (e.g. "fix ticket 0037", "make 0037 ready"). Uses Supabase credentials from HAL config (Connect Project Folder).
- **update-ticket-body-in-supabase.js** script: For one-time/migration fix of 0037 from CLI. Reads from docs/tickets, normalizes headings, updates DB. Does not rely on editing the doc as the *fix* — we write to DB; the doc is the source of the correct content.

## Section heading format

- evaluateTicketReady expects **##** (H2) for required sections. Some tickets use # (H1). The script normalizes # → ## for Goal, Human-verifiable deliverable, Acceptance criteria, Constraints, Non-goals so doc-sourced content passes the check.

## No doc edit reliance

- The ticket constraint "Do not rely on editing docs/tickets/0037-*.md for the fix" means the *workflow* must write to DB. The script can read the doc as source but the fix is the DB update. The PM tool writes whatever body_md the agent provides.
