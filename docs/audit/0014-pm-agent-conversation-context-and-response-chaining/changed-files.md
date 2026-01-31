# Changed Files: 0014 - PM agent: conversation context + response chaining

## Modified (HAL repo)

- **src/App.tsx**
  - Send bounded conversation context to `/api/pm/respond`:
    - if DB connected: persist messages to `hal_conversation_messages` and send `{ projectId, supabaseUrl, supabaseAnonKey }` so server can build a summary+recent context pack
    - otherwise: send `conversationHistory` (bounded by a character budget) plus `previous_response_id` (when available)
  - State: `pmLastResponseId`; set from response `responseId`; reset on disconnect and on connect.
  - Diagnostics: `pmLastResponseId`, `previousResponseIdInLastRequest`; panel rows "PM last response ID" and "previous_response_id in last request".
  - Conversation window bounded by character count (see code constant) to avoid runaway prompt growth.
  - `PmAgentResponse` type: added `responseId?: string`.
  - `DiagnosticsInfo` type: added `pmLastResponseId`, `previousResponseIdInLastRequest`.

- **vite.config.ts**
  - Request body: parse `conversationHistory` (array) and `previous_response_id` (string).
  - When `projectId` + Supabase creds are provided, fetch full conversation history from Supabase and build a bounded context pack:
    - summary of older turns (stored in `hal_conversation_summaries`, generated via external LLM when needed)
    - recent turns within a character budget (e.g. 12k chars)
  - Pass `conversationHistory` / `conversationContextPack` and `previousResponseId` through to `runPmAgent`.
  - `PmAgentResponse` interface: added `responseId?: string`.

- **docs/hal-conversation-schema.md**
  - Document Supabase schema for `hal_conversation_messages` and `hal_conversation_summaries` and how the bounded context pack is built.

## Modified (hal-agents submodule)

- **projects/hal-agents/src/agents/projectManager.ts**
  - `PmAgentConfig`: accept conversation context (`conversationHistory?` and/or `conversationContextPack?`) and `previousResponseId?`.
  - `runPmAgent`: pass `providerOptions.openai.previousResponseId` to `generateText` when set; return `responseId` from provider metadata.

## Created

- `docs/audit/0014-pm-agent-conversation-context-and-response-chaining/plan.md`
- `docs/audit/0014-pm-agent-conversation-context-and-response-chaining/worklog.md`
- `docs/audit/0014-pm-agent-conversation-context-and-response-chaining/changed-files.md`
- `docs/audit/0014-pm-agent-conversation-context-and-response-chaining/decisions.md`
- `docs/audit/0014-pm-agent-conversation-context-and-response-chaining/verification.md`
- `docs/audit/0014-pm-agent-conversation-context-and-response-chaining/pm-review.md`
