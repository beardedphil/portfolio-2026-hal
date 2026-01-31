# PM Review: 0014 - PM agent: conversation context + response chaining

## Summary

- PM chat now sends prior turns as `conversationHistory` to `/api/pm/respond`; server forwards to PM agent; agent adds "Conversation so far" to context pack (bounded to last 20 messages, with truncation note if needed).
- Responses API continuity: client stores `pmLastResponseId` from each PM response and sends `previous_response_id` on the next request; agent passes it via `providerOptions.openai.previousResponseId`; Diagnostics show last response ID and whether previous_response_id was used in the last request.
- Response chain resets when disconnecting or when connecting to a project.

## Likelihood of success

**Score (0–100%)**: 85%

**Why:**

- Implementation follows existing patterns (context pack, Diagnostics, body parsing).
- Conversation history is a straightforward array in the prompt; bounded window avoids unbounded growth.
- AI SDK and OpenAI Responses API support for `previousResponseId` / `responseId` is documented and used as in the guide.
- Diagnostics make it obvious what was sent (Outbound Request JSON, PM last response ID, previous_response_id in last request).

**Risk factors:**

- Provider metadata shape (`providerMetadata.openai.responseId`) may vary by AI SDK version; we guard with optional chaining.
- Very long conversations still send last 20 in context pack; combined with continuity, behavior should remain correct.

## What to verify (UI-only)

- Two-turn flow: PM asks → user answers → PM uses the answer (no re-asking).
- Diagnostics: Outbound Request JSON shows conversation context; "PM last response ID" and "previous_response_id in last request" visible and correct after second turn.
- Disconnect/connect clears PM last response ID; first request after connect does not send previous_response_id.

## Potential failures (ranked)

1. **PM ignores prior answer** — Second response re-asks or doesn’t refer to user’s answer; check that conversationHistory is built from prior turns only and that "Conversation so far" appears in context pack / outbound request.

2. **previous_response_id never yes** — PM last response ID stays "none" or previous_response_id in last request always "no"; check that server returns `responseId` and client sets `pmLastResponseId`; check that next request body includes `previous_response_id`.

3. **Outbound Request JSON doesn’t show conversation** — Prompt may be nested; ensure Diagnostics expand shows the full request (or at least a clear "Conversation so far" or equivalent in the payload).

4. **Response ID lost on refresh** — By design we do not persist responseId; after refresh, first request has no previous_response_id; conversation history from persisted messages still provides context.

## Audit completeness check

- **Artifacts present**: plan, worklog, changed-files, decisions, verification, pm-review
- **Traceability**: Ticket 0014 acceptance criteria mapped to implementation and verification steps

## Follow-ups (optional)

- Consider persisting `pmLastResponseId` per project in localStorage if we want continuity across reloads.
- Add token/size budget for "Conversation so far" if we need to cap prompt size more aggressively.
