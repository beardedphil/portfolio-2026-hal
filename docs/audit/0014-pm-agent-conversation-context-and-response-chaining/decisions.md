# Decisions: 0014 - PM agent: conversation context + response chaining

## D1: Conversation history in context pack only (no separate API input format change)

- **Decision**: Send `conversationHistory` as an array of `{ role, content }` from client; server forwards to PM agent; agent renders it as a "Conversation so far" section in the context pack (same prompt as today, with extra section).
- **Why**: Minimal change; context pack already contains user message and repo context; adding a section is clear and keeps a single prompt shape. Outbound request captured by hal-agents includes the full prompt body, so Diagnostics shows the conversation context.

## D2: Bounded window (last 20 messages)

- **Decision**: Use last 20 messages for "Conversation so far"; if more than 20, slice to last 20 and add a truncation note "(older messages omitted; showing last 20 messages)".
- **Why**: Ticket constraint to avoid runaway prompt growth; 20 gives ~10 user/assistant turns which is enough for typical clarifying flows.

## D3: Prior turns only (exclude current user message from history)

- **Decision**: Build `conversationHistory` from messages before the current one (e.g. `priorTurns = pmMessages.slice(0, -1)` after the current user message has been added to state).
- **Why**: Current message is sent as `message`; including it again in history would duplicate it. Client adds user message to state then builds body from current state, so we exclude the last message when building history.

## D4: Responses API continuity via previousResponseId

- **Decision**: Use AI SDK `providerOptions: { openai: { previousResponseId } }` when continuing a conversation; store and return `responseId` from `result.providerMetadata?.openai?.responseId`; client sends `previous_response_id` on next request when available.
- **Why**: Matches ticket requirement for optional Responses API continuity; reduces need to resend full transcript while still sending conversation history for clarity and fallback.

## D5: pmLastResponseId in client state only; reset on project switch

- **Decision**: Keep `pmLastResponseId` in React state; do not persist to localStorage. Reset to null on disconnect and when connecting to a project (each connect starts a fresh chain for that session).
- **Why**: Ticket says "per-project pmLastResponseId … reset when switching projects". Conversations are already persisted per project; response chain is session-scoped so reload starts without continuity until first response.

## D6: Diagnostics: derive previous_response_id usage from outbound request

- **Decision**: Show "previous_response_id in last request: yes/no" by checking whether `lastPmOutboundRequest` has a non-null `previous_response_id` (redact does not strip this key).
- **Why**: Single source of truth (what we actually sent); no extra client state needed.

## Unrequested changes (required)

Ticket `0014` explicitly listed “summarization/memory compression” as a non-goal, but implementation included additional scope:

- **Added Supabase conversation persistence + summarization**
  - `hal_conversation_messages` and `hal_conversation_summaries` tables
  - server-side bounded context pack built from (summary of older turns + recent turns within a character budget)
  - optional external LLM summarization of older turns
- **Why it happened**: This improves “infinite conversation” durability and avoids runaway prompt growth, but it should have been tracked as a separate ticket.
- **How to verify in UI**:
  - With a project connected, have a multi-turn PM conversation.
  - Confirm Diagnostics “Outbound Request JSON” contains a bounded conversation context (and, if applicable, summary+recent wording).
