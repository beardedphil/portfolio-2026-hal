# Plan: 0046 - Implementation Agent full workflow via Cursor Cloud Agents API

## Objective

Wire the Implementation Agent to the Cursor Cloud Agents API so the user can say "Implement ticket XXXX" and the agent fetches the ticket, launches a Cursor cloud agent with the ticket's goal and acceptance criteria, and moves the ticket to QA when the agent completes.

## Approach

1. **Backend (`vite.config.ts` implementation-agent-endpoint)**:
   - Parse "Implement ticket XXXX" (regex) to extract ticket ID
   - If no match: return clear error via NDJSON stream
   - Fetch ticket from Supabase (if creds provided) or docs/tickets
   - Build prompt from Goal, Human-verifiable deliverable, Acceptance criteria
   - Resolve GitHub repo URL via `git remote get-url origin`, normalize to https form
   - If no GitHub: return clear error without attempting Cursor API
   - POST /v0/agents with prompt.text, source.repository, source.ref, target.autoCreatePr
   - Stream NDJSON stages: fetching_ticket → resolving_repo → launching → polling → completed/failed
   - Poll GET /v0/agents/{id} until FINISHED (or FAILED/CANCELLED/ERROR)
   - On FINISHED: update ticket in Supabase (kanban_column_id = 'col-qa'), update body_md frontmatter, run sync-tickets
   - Return summary and PR link in final stage

2. **Frontend (`App.tsx`)**:
   - Pass supabaseUrl, supabaseAnonKey when project connected
   - Consume NDJSON stream via fetch + ReadableStream
   - Update status timeline: Preparing → Fetching ticket → Resolving repo → Launching agent → Running → Completed/Failed
   - Display result (summary, PR link) or human-readable error on completion
   - Update banner to describe "Implement ticket XXXX" flow

3. **Error handling**:
   - Cursor API not configured: clear message, no request
   - No GitHub remote: clear error before launch
   - Launch/poll failures: humanReadableCursorError (no stack traces)

## Scope

- **In scope**: Full workflow (fetch ticket, launch agent, poll, move to QA), streaming status, error states
- **Out of scope**: Webhooks, follow-up messages, stop/delete agent, non-GitHub repos

## Files to Change

1. `vite.config.ts` - Replace GET /v0/me with full workflow, NDJSON streaming
2. `src/App.tsx` - Stream consumption, expanded status timeline, pass Supabase creds
3. `docs/audit/0046-implementation-agent-cursor-cloud-agents-api/*` - Audit artifacts
