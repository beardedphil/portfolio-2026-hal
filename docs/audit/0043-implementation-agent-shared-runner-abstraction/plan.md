# Plan: 0043 - Abstract shared "agent runner" logic for reuse by Implementation Agent

## Objective

Refactor the existing Project Manager agent execution logic into a reusable abstraction that the new Implementation Agent can share, without changing user-visible behavior. Add a human-verifiable diagnostics line showing which runner is active.

## Approach

1. **hal-agents**: Introduce a small runner abstraction
   - New file `projects/hal-agents/src/agents/runner.ts`
   - Define `AgentRunner` interface: `label` (string) + `run(message, config)` returning `PmAgentResult`
   - Export `SHARED_RUNNER_LABEL = 'v2 (shared)'` and `getSharedRunner()` that returns a runner wrapping `runPmAgent`
   - Re-export `summarizeForContext` from runner so the app has a single entry point

2. **vite.config.ts**: Use the shared runner for the PM endpoint
   - Load `dist/agents/runner.js` instead of `projectManager.js` for the PM respond middleware
   - Call `getSharedRunner()` then `runner.run(message, config)` instead of `runPmAgent` directly
   - Include `agentRunner: runner.label` in the JSON response

3. **App.tsx**: Show runner in Diagnostics
   - Add `agentRunner?: string` to `PmAgentResponse` and `DiagnosticsInfo`
   - Store `data.agentRunner` from the last PM response in state
   - In the Diagnostics panel (when Project Manager is selected), add a row: "Agent runner:" with value e.g. "v2 (shared)" or "—" before first request

## Scope

- **In scope**: Runner interface, PM wired through runner, diagnostics line, audit artifacts
- **Out of scope**: Implementation Agent behavior, Cursor API, ticket/kanban changes

## Files to Change

1. `projects/hal-agents/src/agents/runner.ts` (new) – runner interface and shared implementation
2. `vite.config.ts` – PM endpoint loads runner, calls `runner.run()`, returns `agentRunner`
3. `src/App.tsx` – `PmAgentResponse`/DiagnosticsInfo types, state, and "Agent runner:" row in Diagnostics

## Risk Assessment

- Low risk: Refactor only; PM still uses the same `runPmAgent` under the hood
- Verification: PM chat still works; Diagnostics shows "Agent runner: v2 (shared)" after a PM message
