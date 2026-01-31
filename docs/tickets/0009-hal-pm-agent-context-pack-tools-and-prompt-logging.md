# Ticket

- **ID**: `0009`
- **Title**: HAL PM agent foundation: context pack + read-only tools + full prompt logging
- **Owner**: Implementation agent
- **Type**: Feature
- **Priority**: P0

## Linkage (for tracking)

- **Fixes**: (n/a)
- **Category**: (n/a)
- **Depends on**: `hal-agents#0003` (PM agent core: context pack, tools, tool loop)

## Goal (one sentence)

Make HAL’s Project Manager chat behave like a real agent: build a **mandatory context pack**, support **read-only tool calls** to explore the repo, and expose the **exact outbound OpenAI request** (redacted) in Diagnostics.

## Human-verifiable deliverable (UI-only)

A human can open HAL, select **Agent: Project Manager**, send a message like “Summarize ticket 0007 and cite where it lives,” and then:
- see the PM respond (still okay to show raw JSON in the transcript), and
- expand **Diagnostics** and view the **entire outbound request JSON** sent to OpenAI (including the generated context pack and tool definitions), with secrets redacted.

## Acceptance criteria (UI-only)

- [ ] Project Manager requests are sent to OpenAI with:
  - [ ] stable PM agent instructions (system/developer message) and
  - [ ] a HAL-generated **context pack** that always includes:
    - [ ] the user message (verbatim),
    - [ ] key repo rules needed for PM work (from `.cursor/rules/`),
    - [ ] a minimal repo state snapshot (at least `git status -sb` output or equivalent).
- [ ] The PM agent has access to **read-only tools** that allow it to discover information in the repo (at minimum: list directory, read file, and search).
- [ ] If the PM agent uses a tool during a response, the tool call(s) and tool output(s) are visible in the raw JSON and/or Diagnostics so a human can see what happened.
- [ ] Diagnostics includes a new section that shows:
  - [ ] the **exact outbound request JSON** sent to OpenAI for the last PM message (including context pack + tools),
  - [ ] with **sensitive values redacted** (API keys, Supabase keys, `.env` secrets, etc.), preserving structure and key names.
- [ ] Failures are explainable from inside the app:
  - [ ] If the OpenAI request fails, Diagnostics shows last HTTP status and last error string (existing behavior is fine),
  - [ ] If context pack building fails (e.g. file missing), the PM reply and/or Diagnostics shows a clear error.

## Constraints

- Keep this task as small as possible while still producing a **human-verifiable** UI change.
- Verification must require **no external tools** (no terminal, no devtools, no console).
- Do not expose secrets to the browser:
  - OpenAI/Supabase keys must not appear in client bundles.
  - Diagnostics must **redact** sensitive values.
- **Tool policy**: for this ticket, tools must be **read-only** (no file edits, no git commits, no kanban mutations yet).

## Non-goals

- Kanban tool/mutation bridge (move tickets, create columns, etc.) — follow-up ticket.
- Write-capable repo tools (edit tickets, run sync, commit/push) — follow-up ticket.
- Long-term memory/summarization beyond basic multi-turn continuity (optional later).

## Implementation notes (optional)

- Suggested approach:
  - Introduce a dedicated PM endpoint (e.g. `POST /api/pm/respond`) that:
    - builds the context pack,
    - calls OpenAI Responses API with PM instructions + tools,
    - runs a minimal tool loop for read-only tools, and
    - returns both the raw OpenAI JSON and a debug bundle for Diagnostics.
  - Use Responses API continuity (`previous_response_id`) per PM conversation.
  - Redaction: implement a server-side redaction pass before sending “outbound request JSON” to the client.
- Keep existing `/api/openai/responses` as a low-level primitive if helpful, but PM should go through a higher-level endpoint so the full prompt bundle is capturable.

## Audit artifacts required (implementation agent)

Create `docs/audit/0009-hal-pm-agent-context-pack-tools-and-prompt-logging/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)
- `pm-review.md`

