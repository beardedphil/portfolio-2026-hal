# Worklog: 0014 - PM agent: conversation context + response chaining

## Session 1

### Analysis

- Read ticket 0014: conversation history in PM request + optional Responses API continuity via `previous_response_id`.
- Reviewed `App.tsx`: PM send uses `{ message }` only; no conversation history or responseId.
- Reviewed `vite.config.ts`: body parsed as `{ message }`; `runPmAgent(message, config)` with repoRoot, openaiApiKey, openaiModel.
- Reviewed `projects/hal-agents/src/agents/projectManager.ts`: `buildContextPack` has user message, rules, git status; no conversation section. `runPmAgent` does not accept or pass `previousResponseId`.
- Confirmed Vercel AI SDK supports `providerOptions.openai.previousResponseId` and returns `result.providerMetadata?.openai?.responseId` (OpenAI Responses API guide).

### Implementation

#### hal-agents projectManager.ts

- Added `ConversationTurn` type and `conversationHistory?`, `previousResponseId?` to `PmAgentConfig`.
- Added `responseId?: string` to `PmAgentResult`.
- Added `CONVERSATION_HISTORY_MAX_MESSAGES = 20`.
- In `buildContextPack`: prepend "Conversation so far" section when `config.conversationHistory` is present; use last 20 messages; add truncation note when truncated.
- In `runPmAgent`: build `providerOptions = { openai: { previousResponseId } }` when `previousResponseId` set; pass to `generateText`.
- Extract `responseId` from `result.providerMetadata?.openai?.responseId` and include in return.

#### vite.config.ts

- Extended body type: `message`, `conversationHistory?`, `previous_response_id?`.
- Pass `conversationHistory` and `previousResponseId` to `runPmAgent`.
- Added `responseId?: string` to `PmAgentResponse`; result is passed through so responseId is returned when present.

#### App.tsx

- Added `CONVERSATION_HISTORY_MAX_MESSAGES = 20`.
- Build `conversationHistory` from prior PM turns only: `conversations['project-manager'].slice(0, -1).slice(-20)` mapped to `{ role, content }` (user → 'user', project-manager → 'assistant').
- Request body: `{ message, conversationHistory, previous_response_id? }` (include `previous_response_id` when `pmLastResponseId` is set).
- State: `pmLastResponseId`; set from `data.responseId` on successful PM response.
- Reset `pmLastResponseId` in `handleDisconnect` and in `handleConnectProjectFolder` (when setting connected project).
- Extended `DiagnosticsInfo` with `pmLastResponseId` and `previousResponseIdInLastRequest` (derived from `lastPmOutboundRequest?.previous_response_id`).
- Diagnostics panel: two new rows when PM selected — "PM last response ID" and "previous_response_id in last request: yes/no".
- Added `conversations` and `pmLastResponseId` to `handleSend` dependency array.

### Verification

- [x] hal-agents `npm run build` succeeds.
- [x] No lint errors in App.tsx, vite.config.ts, projectManager.ts.
- [x] Outbound request will show conversation context (context pack includes "Conversation so far"); Diagnostics shows PM last response ID and previous_response_id usage.
