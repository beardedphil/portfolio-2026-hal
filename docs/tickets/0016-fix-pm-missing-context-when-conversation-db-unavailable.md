# Ticket

- **ID**: `0016`
- **Title**: Fix PM context loss when conversation DB is unavailable (fallback to client history)
- **Owner**: Implementation agent
- **Type**: Bug
- **Priority**: P0

## Linkage (for tracking)

- **Fixes**: `0014`
- **Category**: State

## Goal (one sentence)

Ensure PM requests always include usable conversation context, even when Supabase conversation tables are missing/unavailable, by falling back to client-side conversation history and surfacing the context source in Diagnostics.

## Human-verifiable deliverable (UI-only)

A human can connect a project **without** the new conversation tables created, chat with the PM for 2+ turns, and see that the PM still understands their follow-up answers (does not “forget”), and Diagnostics clearly shows that context was sourced from **client history** (not DB).

## Acceptance criteria (UI-only)

- [ ] When conversation DB is unavailable (e.g. missing `hal_conversation_messages`), PM requests still include prior turns:
  - [ ] PM asks a question, user answers, PM uses the answer on the next turn.
  - [ ] Diagnostics → “Outbound Request JSON” shows a “Conversation so far” section (or equivalent) containing the prior turns.
- [ ] Client request always includes a safe fallback:
  - [ ] Even in DB mode, client includes `conversationHistory` (bounded) in the request body so the server can fall back if DB fetch fails.
- [ ] Server fallback is robust:
  - [ ] If DB fetch/build of `conversationContextPack` fails for any reason, the server uses `conversationHistory` (if provided) rather than sending no conversation context.
- [ ] Diagnostics clearly indicates which context path was used for the last PM request:
  - [ ] `contextSource` shows one of: `db_summary_recent`, `client_history`, `none`
  - [ ] if DB failed, show a short DB error string in Diagnostics (redacted as needed).

## Constraints

- Keep this task as small as possible while still producing a **human-verifiable** UI change.
- Verification must require **no external tools** (no terminal, no devtools, no console).
- Do not expose secrets in client bundles or Diagnostics (redaction rules apply).
- Keep existing DB mode behavior intact when the tables exist (this is a fallback/robustness ticket).

## Non-goals

- Changing the Supabase schema or requiring DB tables to exist (we explicitly support the “DB missing” scenario).
- Reworking the summarization strategy introduced in `0014` (tracked under `0015`).
- Ticket creation (`0011`) or kanban moves (`0012`).

## Implementation notes (optional)

- Current bug shape:
  - In `src/App.tsx`, when DB mode is enabled the request body sends `{ message, projectId, supabaseUrl, supabaseAnonKey }` but **omits** `conversationHistory`.
  - If the DB tables are missing, the server’s DB context pack build fails; because `conversationHistory` wasn’t provided, the agent prompt contains no “Conversation so far.”
- Minimal fix:
  - Always compute bounded `conversationHistory` from local state and include it in the request body (even in DB mode).
  - In `vite.config.ts`, if DB context build fails, keep and pass through the provided `conversationHistory`.
  - Add small diagnostics fields to make the chosen context path visible in-app.

## Audit artifacts required (implementation agent)

Create `docs/audit/0016-fix-pm-missing-context-when-conversation-db-unavailable/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)
- `pm-review.md`

