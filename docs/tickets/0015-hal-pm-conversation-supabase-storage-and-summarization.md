# Ticket

- **ID**: `0015`
- **Title**: Track scope creep: PM conversation storage in Supabase + summarization + bounded context pack
- **Owner**: Implementation agent
- **Type**: Chore
- **Priority**: P0

## Linkage (for tracking)

- **Fixes**: `0014`
- **Category**: Process

## Goal (one sentence)

Formally track (and verify) the Supabase-backed PM conversation storage + summarization + bounded context pack behavior that was introduced during ticket `0014`.

## Human-verifiable deliverable (UI-only)

A human can connect a project, have a long PM conversation, and see in Diagnostics that the outbound prompt includes a bounded “conversation context pack” (summary + recent messages), without the PM “forgetting” earlier answers.

## Acceptance criteria (UI-only)

- [ ] There is a clear source-of-truth doc for the schema and behavior:
  - [ ] `docs/hal-conversation-schema.md` exists and describes `hal_conversation_messages` and `hal_conversation_summaries`, including how summaries are updated.
- [ ] In-app behavior matches the documented intent:
  - [ ] When a project is connected, PM messages are persisted to Supabase (and do not rely only on browser localStorage).
  - [ ] Over a longer conversation, Diagnostics shows the prompt context remains bounded (e.g. “summary of earlier conversation” + “recent conversation within N characters”).
- [ ] Summarization behavior is safe and visible:
  - [ ] It is explicit (in docs and/or Diagnostics) that the external LLM may be used to summarize older turns.
  - [ ] Failures to read/write conversation tables surface a clear in-app error (Diagnostics).
- [ ] No further feature additions are made under this ticket unless required to make the behavior verifiable and diagnosable in-app.

## Constraints

- Keep this task as small as possible while still producing a **human-verifiable** UI change.
- Verification must require **no external tools** (no terminal, no devtools, no console).
- This ticket is about **tracking + verification + diagnostics**, not inventing new product behavior.

## Non-goals

- Changing ticket `0014`’s intended minimal/optional behavior (already shipped).
- Adding ticket-creation tooling (`0011`) or kanban moves (`0012`).

## Implementation notes (optional)

- If any of the shipped behavior is not currently diagnosable in-app, add the minimum diagnostics needed (e.g. “DB conversation mode: on/off”, “summary through sequence”, “recent char budget used”).

## Audit artifacts required (implementation agent)

Create `docs/audit/0015-hal-pm-conversation-supabase-storage-and-summarization/` containing:
- `plan.md`
- `worklog.md`
- `changed-files.md`
- `decisions.md`
- `verification.md` (UI-only)
- `pm-review.md`

