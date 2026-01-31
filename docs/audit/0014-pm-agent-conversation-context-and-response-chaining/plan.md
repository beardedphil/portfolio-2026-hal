# Plan: 0014 - PM agent: conversation context + response chaining

## Goal

Make PM chat truly conversational by including prior turns in the PM agent request (minimal path) and enabling Responses API continuity via `previous_response_id`.

## Analysis

### Current State

- Client sends only `{ message }` to `/api/pm/respond`.
- Server calls `runPmAgent(message, { repoRoot, openaiApiKey, openaiModel })`.
- PM agent builds context pack from user message, .cursor/rules, git status only; no conversation history.
- No response chaining; each turn is stateless.

### Required Changes

1. **Minimal path (required)**
   - Client sends `conversationHistory` (last N messages) to `/api/pm/respond`.
   - Server forwards `conversationHistory` into PM agent config.
   - PM agent includes a "Conversation so far" section in its context pack (bounded window, truncation note if needed).
   - Diagnostics: Outbound Request JSON shows prior turns / "Conversation so far" (via context in prompt).
   - Verify with 2-turn: PM asks question → user answers → PM uses the answer (does not re-ask).

2. **Optional improvement (also required by ticket)**
   - Implement Responses API continuity using `previous_response_id`.
   - Per-project `pmLastResponseId` in client state; reset when switching projects.
   - Diagnostics: show last PM response ID and whether `previous_response_id` was included in last request.

### Constraints

- Bounded conversation window (e.g. last 10–30 messages) and/or size budget; truncation note in context pack if truncated.
- No secrets in client; Diagnostics remains redacted.
- Verification UI-only (no terminal/devtools required).

## Implementation Steps

### Step 1: hal-agents PM agent

- Add `ConversationTurn` type and `conversationHistory?: ConversationTurn[]`, `previousResponseId?: string` to `PmAgentConfig`.
- In `buildContextPack`: add "Conversation so far" section from `config.conversationHistory` (last 20 messages), with truncation note if > 20.
- In `runPmAgent`: pass `providerOptions: { openai: { previousResponseId } }` to `generateText` when `previousResponseId` is set.
- Return `responseId` from `result.providerMetadata?.openai?.responseId` in `PmAgentResult`.

### Step 2: vite.config.ts

- Parse body: `message`, `conversationHistory?`, `previous_response_id?`.
- Pass `conversationHistory` and `previousResponseId` to `runPmAgent`.
- Add `responseId?: string` to `PmAgentResponse`; return it in JSON.

### Step 3: App.tsx client

- Build `conversationHistory` from prior PM messages (exclude current message): last 20 turns, format `{ role: 'user'|'assistant', content }`.
- Send `conversationHistory` and `previous_response_id` (when `pmLastResponseId` is set) in request body.
- State: `pmLastResponseId`; set from `data.responseId` on success; reset on disconnect and on connect (switching projects).
- Add to `DiagnosticsInfo`: `pmLastResponseId`, `previousResponseIdInLastRequest` (derived from `lastPmOutboundRequest.previous_response_id`).
- Diagnostics panel: show "PM last response ID" and "previous_response_id in last request: yes/no".

### Step 4: Audit artifacts

- Create `docs/audit/0014-pm-agent-conversation-context-and-response-chaining/` with plan, worklog, changed-files, decisions, verification, pm-review.

## Files to Change

- `projects/hal-agents/src/agents/projectManager.ts` — config, context pack, providerOptions, responseId.
- `vite.config.ts` — body parsing, pass-through, response type.
- `src/App.tsx` — build and send conversationHistory, pmLastResponseId state, diagnostics.
- `docs/audit/0014-pm-agent-conversation-context-and-response-chaining/*.md` — audit artifacts.

## Verification (UI-only)

1. Connect project, open PM chat.
2. Send message; PM responds (possibly with clarifying question).
3. Send follow-up answer; PM response demonstrates it understood (does not re-ask).
4. Open Diagnostics → Outbound Request JSON: contains "Conversation so far" or prior turns in prompt.
5. After second turn: Diagnostics shows "PM last response ID" (non-empty) and "previous_response_id in last request: yes".
