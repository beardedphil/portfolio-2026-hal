# Worklog: 0043 - Abstract shared "agent runner" logic for reuse by Implementation Agent

## Session 1

### Tasks Completed

1. **Created `projects/hal-agents/src/agents/runner.ts`**
   - Defined `SHARED_RUNNER_LABEL = 'v2 (shared)'`
   - Defined `AgentRunner` interface: `label: string`, `run(message, config): Promise<PmAgentResult>`
   - Implemented `getSharedRunner()` returning `{ label, run: runPmAgent }`
   - Re-exported `summarizeForContext` from projectManager for single entry point

2. **Updated `vite.config.ts` (pm-agent-endpoint)**
   - Switched import from `projectManager.js` to `runner.js`
   - Middleware now loads `runnerModule` with `getSharedRunner` and `summarizeForContext`
   - Context-pack building uses `runnerModule.summarizeForContext`
   - Stub check: `runner = runnerModule?.getSharedRunner?.()`, then `if (!runner?.run)`
   - Invocation: `runner.run(message, config)` instead of `pmAgentModule.runPmAgent(...)`
   - Response includes `agentRunner: runner.label`
   - Extended `PmAgentResponse` interface with `agentRunner?: string`

3. **Updated `src/App.tsx`**
   - Added `agentRunner?: string` to `PmAgentResponse` type
   - Added `agentRunner: string | null` to `DiagnosticsInfo` and state `agentRunner`
   - On PM response: `setAgentRunner(data.agentRunner ?? null)`
   - In Diagnostics panel (when Project Manager selected): new row "Agent runner:" with value `diagnostics.agentRunner ?? '—'`

4. **Built hal-agents**
   - `npm run build` in `projects/hal-agents` produces `dist/agents/runner.js` (and projectManager.js, tools.js)

5. **Created audit artifacts**
   - `docs/audit/0043-implementation-agent-shared-runner-abstraction/`: plan.md, worklog.md, changed-files.md, decisions.md, verification.md, pm-review.md

### Implementation Notes

- PM behavior is unchanged: the same `runPmAgent` is invoked via `runner.run`
- The check-unassigned endpoint still imports `projectManager.js` directly for `checkUnassignedTickets`; the runner is only for the respond flow
- Agent runner row is shown only when "Project Manager" is the selected chat target
