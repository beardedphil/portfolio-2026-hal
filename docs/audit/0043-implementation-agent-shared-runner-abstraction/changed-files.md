# Changed Files: 0043 - Abstract shared "agent runner" logic for reuse by Implementation Agent

## New Files

### `projects/hal-agents/src/agents/runner.ts`
- Defines `SHARED_RUNNER_LABEL = 'v2 (shared)'`
- Defines `AgentRunner` interface with `label` and `run(message, config)`
- Exports `getSharedRunner()` returning runner that delegates to `runPmAgent`
- Re-exports `summarizeForContext` from projectManager

### `docs/audit/0043-implementation-agent-shared-runner-abstraction/`
- `plan.md` – Implementation plan
- `worklog.md` – Work session log
- `changed-files.md` – This file
- `decisions.md` – Design decisions
- `verification.md` – UI verification checklist
- `pm-review.md` – PM review placeholder

## Modified Files

### `vite.config.ts`
- `PmAgentResponse` interface: added `agentRunner?: string`
- PM respond middleware: import from `projects/hal-agents/dist/agents/runner.js` instead of projectManager.js
- Variable renamed: `pmAgentModule` → `runnerModule`; dist path → `runnerDistPath`
- Stub check: use `getSharedRunner()` and `runner?.run` instead of `runPmAgent`
- Invocation: `runner.run(message, config)` instead of `pmAgentModule.runPmAgent(...)`
- Response object: set `agentRunner: runner.label`

### `src/App.tsx`
- `PmAgentResponse` type: added `agentRunner?: string`
- `DiagnosticsInfo` type: added `agentRunner: string | null`
- State: added `agentRunner` and `setAgentRunner`
- On PM response handling: `setAgentRunner(data.agentRunner ?? null)`
- Diagnostics object: included `agentRunner`
- Diagnostics panel: new row "Agent runner:" with value `diagnostics.agentRunner ?? '—'` when `selectedChatTarget === 'project-manager'`
