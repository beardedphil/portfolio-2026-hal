## Ticket

- **ID**: 0046
- **Title**: Implementation Agent full workflow via Cursor Cloud Agents API
- **Owner**: Implementation agent
- **Type**: Feature
- **Priority**: P0

## QA (implementation agent fills when work is pushed)

- **Branch**: `ticket/0046-implementation-agent-cursor-cloud-agents-api`

## Human in the Loop

After QA merges, the ticket moves to **Human in the Loop**. The user tests at http://localhost:5173.

## Desired end-state (user story)

The user says **"Implement ticket XXXX"** and does nothing else until the Implementation Agent has moved the ticket into QA. No further prompts, no manual steps—just that single instruction.

## Goal (one sentence)

Wire the Implementation Agent to the Cursor Cloud Agents API so the user can say "Implement ticket XXXX" and the agent fetches the ticket, launches a Cursor cloud agent with the ticket's goal and acceptance criteria, and moves the ticket to QA when the agent completes.

## Human-verifiable deliverable (UI-only)

When **Implementation Agent** is selected and the user says **"Implement ticket XXXX"** (e.g. "Implement ticket 0046"):
- The UI shows a run started and displays a status timeline (Preparing → Fetching ticket → Launching agent → Polling / Waiting → Completed / Failed).
- The agent fetches the ticket from Supabase, builds a prompt from its Goal and Acceptance criteria, and launches a Cursor cloud agent on the connected GitHub repo.
- When the agent completes (status FINISHED), the UI shows the result in the chat, and the Implementation Agent moves the ticket to QA (Supabase `kanban_column_id = 'col-qa'`).
- The user does nothing else until the ticket appears in QA. No follow-up prompts required.

## Acceptance criteria (UI-only)

- [ ] When the user says "Implement ticket XXXX" (e.g. "Implement ticket 0046"), the Implementation Agent parses the ticket ID and fetches the ticket from Supabase (or docs/tickets).
- [ ] The agent builds a prompt from the ticket's Goal, Human-verifiable deliverable, and Acceptance criteria, and passes it as `prompt.text` to `POST /v0/agents`.
- [ ] With Implementation Agent selected and a GitHub-backed project connected, the request triggers `POST /v0/agents` with the ticket-derived prompt and repo URL as `source.repository`.
- [ ] The UI shows a status timeline during the run (e.g. Fetching ticket → Launching → Running → Completed/Failed).
- [ ] When the agent completes (status FINISHED), the UI displays the summary and PR link (if applicable) in the chat thread.
- [ ] When the agent completes (status FINISHED), the Implementation Agent moves the ticket to QA in Supabase (`kanban_column_id = 'col-qa'`).
- [ ] The user can say "Implement ticket XXXX" and do nothing else until the ticket appears in QA—no follow-up prompts required.
- [ ] If the connected project has no GitHub remote or cannot be resolved to a GitHub URL, the UI shows a clear error without attempting the request.
- [ ] If Cursor API is not configured or the request fails, the UI shows a human-readable error state (no stack trace).

## Constraints

- Keep the scope focused on: launch agent, poll/display status, show result. Defer follow-up messages and advanced options.
- Verification must require **no external tools** (no terminal, no devtools, no console).
- Do not display secrets (API keys) anywhere.
- Resolve GitHub repo URL from connected project path (e.g. `git remote get-url origin` or equivalent).

## Non-goals

- Webhook-based status updates (polling is sufficient for MVP).
- Supporting non-GitHub repos (Cursor Cloud Agents API requires GitHub).
- Add follow-up (`POST /v0/agents/{id}/followup`) in this ticket.
- Stop/delete agent from HAL UI.

## Implementation notes (optional)

- Cursor Cloud Agents API: https://cursor.com/docs/cloud-agent/api/endpoints
- Parse "Implement ticket XXXX" (e.g. regex or simple pattern) to extract ticket ID.
- Fetch ticket: Supabase `tickets` table or `docs/tickets/{id}-*.md`; build prompt from Goal + Human-verifiable deliverable + Acceptance criteria.
- Launch agent: `POST /v0/agents` with `prompt.text`, `source.repository`, `source.ref`, optional `target.autoCreatePr`, `target.branchName`.
- Agent status: `GET /v0/agents/{id}` — status values: CREATING, RUNNING, FINISHED, etc.
- On FINISHED: update ticket in Supabase via `update({ kanban_column_id: 'col-qa', kanban_position, kanban_moved_at })`; reuse existing Supabase client / update patterns from PM agent or Kanban.
- Resolve `source.repository` from connected project: run `git remote get-url origin` in project root; normalize to `https://github.com/owner/repo` form.
- Reuse existing `/api/implementation-agent/run` proxy pattern; extend to `POST /v0/agents` instead of `GET /v0/me`.

## Audit artifacts required (implementation agent)

Create `docs/audit/0046-implementation-agent-cursor-cloud-agents-api/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)
- `pm-review.md`
