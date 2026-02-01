---
kanbanColumnId: col-done
kanbanPosition: 3
kanbanMovedAt: 2026-01-31T13:35:43.32+00:00
---
# Ticket

- **ID**: `0006`
- **Title**: HAL chat: Project Manager via OpenAI Responses API (show raw JSON)
- **Owner**: Implementation agent
- **Type**: Feature
- **Priority**: P0

## Linkage (for tracking)

- **Fixes**: (n/a)
- **Category**: (n/a)

## Goal (one sentence)

In HAL chat, route “Project Manager” messages to OpenAI’s Responses API and display the **exact raw JSON** response blob in the transcript.

## Human-verifiable deliverable (UI-only)

A human can open HAL, choose **Agent: Project Manager**, type a message, click **Send**, and see a new PM reply that is **a big JSON blob** (verbatim OpenAI response) rendered in the chat transcript (copyable text).

## Acceptance criteria (UI-only)

- [ ] With Agent = **Project Manager**, sending any message results in a PM reply that is visibly a **JSON blob** (e.g. starts with `{` and includes top-level keys).
- [ ] The user’s input text is sent to OpenAI **exactly as typed** (no hidden system prompt prefixing or rewriting in the client).
- [ ] The HAL UI displays the **exact** JSON returned by OpenAI (no filtering, summarizing, or extracting “assistant text”).
- [ ] Failures are explainable from inside the app (no devtools/terminal):
  - [ ] If the API is misconfigured (missing key/model), the chat shows a clear error message.
  - [ ] Diagnostics shows the last OpenAI HTTP status (or “no request yet”) and last error string.
- [ ] `.env.example` documents the required OpenAI variables for this feature.

## Constraints

- Keep this task as small as possible while still producing a **human-verifiable** UI change.
- Verification must require **no external tools** (no terminal, no devtools, no console).
- **Do not expose secrets to the browser**:
  - OpenAI API key must not be present in `import.meta.env` or bundled client code.
  - Calls must be made server-side (e.g. Vite dev server middleware / minimal node endpoint).
- No persistence required (in-memory transcript is fine).

## Non-goals

- Building a production-grade backend or auth system.
- Streaming UI (non-streaming is fine).
- Parsing OpenAI output into a “pretty assistant message” (we explicitly want raw JSON for now).
- Multi-agent routing beyond “Project Manager”.

## Implementation notes (optional)

- Suggested approach:
  - Add a small server endpoint like `POST /api/openai/responses` that proxies to OpenAI’s Responses API.
  - Client sends `{ input: <userTextExactlyAsTyped> }` (plus optional model from server env), receives raw JSON, and prints `JSON.stringify(responseJson, null, 2)` in the chat.
- Environment variables:
  - Add something like `OPENAI_API_KEY=...` and `OPENAI_MODEL=...` to `.env.example`.
  - Keep OpenAI vars server-only (do **not** prefix with `VITE_`).

## Audit artifacts required (implementation agent)

Create `docs/audit/0006-hal-chat-openai-responses-api/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)
- `pm-review.md`

