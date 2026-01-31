# Changed Files: 0014 - PM agent: conversation context + response chaining

## Modified (HAL repo)

- **src/App.tsx**
  - Send `conversationHistory` (prior PM turns, last 20) and `previous_response_id` (when set) to `/api/pm/respond`.
  - State: `pmLastResponseId`; set from response `responseId`; reset on disconnect and on connect.
  - Diagnostics: `pmLastResponseId`, `previousResponseIdInLastRequest`; panel rows "PM last response ID" and "previous_response_id in last request".
  - Constant: `CONVERSATION_HISTORY_MAX_MESSAGES = 20`.
  - `PmAgentResponse` type: added `responseId?: string`.
  - `DiagnosticsInfo` type: added `pmLastResponseId`, `previousResponseIdInLastRequest`.

- **vite.config.ts**
  - Request body: parse `conversationHistory` (array) and `previous_response_id` (string).
  - Pass `conversationHistory` and `previousResponseId` to `runPmAgent`.
  - `PmAgentResponse` interface: added `responseId?: string`.

## Modified (hal-agents submodule)

- **projects/hal-agents/src/agents/projectManager.ts**
  - `ConversationTurn` type; `PmAgentConfig`: added `conversationHistory?`, `previousResponseId?`.
  - `PmAgentResult`: added `responseId?: string`.
  - `buildContextPack`: "Conversation so far" section from `conversationHistory` (last 20, truncation note if needed).
  - `runPmAgent`: pass `providerOptions.openai.previousResponseId` to `generateText` when set; return `responseId` from `result.providerMetadata?.openai?.responseId`.
  - Constant: `CONVERSATION_HISTORY_MAX_MESSAGES = 20`.

## Created

- `docs/audit/0014-pm-agent-conversation-context-and-response-chaining/plan.md`
- `docs/audit/0014-pm-agent-conversation-context-and-response-chaining/worklog.md`
- `docs/audit/0014-pm-agent-conversation-context-and-response-chaining/changed-files.md`
- `docs/audit/0014-pm-agent-conversation-context-and-response-chaining/decisions.md`
- `docs/audit/0014-pm-agent-conversation-context-and-response-chaining/verification.md`
- `docs/audit/0014-pm-agent-conversation-context-and-response-chaining/pm-review.md`
