---
kanbanColumnId: col-done
kanbanPosition: 9
kanbanMovedAt: 2026-01-31T16:22:55.002+00:00
---
# Ticket

- **ID**: `0014`
- **Title**: PM agent: include conversation history + optional Responses API chaining
- **Owner**: Implementation agent
- **Type**: Feature
- **Priority**: P0

## Linkage (for tracking)

- **Fixes**: (n/a)
- **Category**: (n/a)

## Goal (one sentence)

Make PM chat truly conversational by including prior turns in the PM agent request (minimal path) and optionally enabling Responses API continuity via `previous_response_id`.

## Human-verifiable deliverable (UI-only)

A human can chat with the PM for multiple turns where the PM asks a question, the user answers it, and the PM correctly uses that answer in the next response. In Diagnostics, the “Outbound Request JSON” clearly shows what conversation context was sent.

## Acceptance criteria (UI-only)

### Minimal path (required)

- [ ] When sending a PM message, HAL includes conversation history in the PM request:
  - [ ] The client sends a `conversationHistory` array (last N messages) to `/api/pm/respond`.
  - [ ] The server forwards `conversationHistory` into the PM agent config.
  - [ ] The PM agent includes a “Conversation so far” section in its context pack.
- [ ] Diagnostics makes it obvious that conversation history is being sent:
  - [ ] “Outbound Request JSON” contains the prior turns (or a clearly labeled “Conversation so far” section).
- [ ] Verify with a simple 2-turn interaction:
  - [ ] PM: asks a clarifying question
  - [ ] User: answers it
  - [ ] PM: demonstrates it understood the answer (does not re-ask as if it never saw it)

### Optional improvement (also required by this ticket)

- [ ] Implement Responses API continuity using `previous_response_id` (or equivalent) so the PM has stronger multi-turn memory without resending the entire transcript each time.
- [ ] Diagnostics shows whether continuity is being used:
  - [ ] Display the last response id used for PM and whether `previous_response_id` was included in the outbound request.

## Constraints

- Keep this task as small as possible while still producing a **human-verifiable** UI change.
- Verification must require **no external tools** (no terminal, no devtools, no console).
- Do not expose secrets in client bundles; Diagnostics must remain redacted as currently implemented.
- Avoid runaway prompt growth:
  - Use a bounded conversation window (e.g. last 10–30 messages) and/or a size budget.
  - If truncation occurs, include a short note in the context pack metadata (e.g. “older messages omitted”).

## Non-goals

- Ticket creation / kanban mutations (tracked separately under ticket `0011` and `0012`).
- Summarization/memory compression (can be a later follow-up if needed).

## Implementation notes (optional)

- This repo already has a local stash showing a likely intended shape:
  - send `conversationHistory` from `src/App.tsx`
  - forward it through `vite.config.ts`
  - include it in `projects/hal-agents/src/agents/projectManager.ts` context pack
- For continuity:
  - Maintain a per-project “pmLastResponseId” in HAL client state (or server memory) and include it on each PM call.
  - Ensure it resets when switching projects (since chats are scoped per project now).

## Audit artifacts required (implementation agent)

Create `docs/audit/0014-pm-agent-conversation-context-and-response-chaining/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)
- `pm-review.md`

