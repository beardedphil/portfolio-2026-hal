# Decisions (0046-implementation-agent-cursor-cloud-agents-api)

## NDJSON streaming for status

**Decision**: Use `application/x-ndjson` response with one JSON object per line instead of a single JSON response or Server-Sent Events.

**Rationale**: Single HTTP request keeps the flow simple; streaming gives real-time status. NDJSON is easy to parse incrementally on the client (split on newlines, JSON.parse each line). SSE would require GET or a different pattern; chunked NDJSON works with POST.

## Ticket fetch order: Supabase first, then docs

**Decision**: When supabaseUrl and supabaseAnonKey are provided, fetch from Supabase `tickets` table first; fall back to docs/tickets if not found. When not connected, fetch only from docs.

**Rationale**: Supabase is the source of truth when connected. docs/tickets may be stale. Fallback to docs ensures we can still run when ticket exists in repo but not yet in DB (or vice versa).

## Git remote resolution from repo root

**Decision**: Run `git remote get-url origin` from the workspace root (vite config `__dirname`), not from a user-selected folder path.

**Rationale**: The File System Access API does not expose full paths. HAL runs from the workspace; the dev server has access to the repo. The "connected project" is the same workspace in practice.

## Branch name format

**Decision**: Use `ticket/{ticketId}-implementation` for target.branchName (e.g. `ticket/0046-implementation`).

**Rationale**: Matches ticket QA branch convention; distinguishes from PM-created branches.
