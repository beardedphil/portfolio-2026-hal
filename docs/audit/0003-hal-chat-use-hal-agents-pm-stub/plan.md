# Implementation Plan: 0003-hal-chat-use-hal-agents-pm-stub

## Goal

Replace HAL's inline PM chat stub with a call into the `portfolio-2026-hal-agents` (submodule at `projects/hal-agents`) Project Manager module so the response comes from the agents repo and is visibly different (e.g. `[PM@hal-agents]`). Diagnostics must show PM implementation source and last agent error.

## Approach

### 1. PM Module in hal-agents (projects/hal-agents)

- Add minimal PM stub in submodule at `projects/hal-agents/src/agents/projectManager.ts`.
- Export `respond({ message, context }) -> { replyText, meta }` with deterministic replies and signature `[PM@hal-agents]`.
- Support standup/status vs generic message cases (per hal-agents ticket 0001).

### 2. HAL Build Configuration

- Add Vite `resolve.alias`: `@hal-agents` → `projects/hal-agents/src`.
- Add TypeScript `paths` and `include` in `tsconfig.app.json` so HAL can import from the submodule and type-check it.

### 3. HAL Chat Integration

- In `App.tsx`, when selected agent is **Project Manager**: call PM `respond()` from `@hal-agents/agents/projectManager`, display returned `replyText`, and on error set `lastAgentError` and show error in transcript.
- When selected agent is **Implementation Agent (stub)**: keep existing inline stub response (unchanged).
- Preserve 500ms delay for both for consistent UX.

### 4. Diagnostics

- Add to diagnostics type and panel:
  - **PM implementation source**: `hal-agents` when Project Manager is selected, `inline` when Implementation Agent is selected.
  - **Last agent error**: last error from PM (or agent) call, or "none".

## Out of Scope

- No HTTP agent server; no real LLM calls.
- Standup aggregation can remain stubbed in HAL (no change to standup button behavior for this ticket).
